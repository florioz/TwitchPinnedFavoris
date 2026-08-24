create table if not exists public.tfr_space_message_reactions (
  message_id uuid not null references public.tfr_space_messages(id) on delete cascade,
  user_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','👀')),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,emoji)
);

alter table public.tfr_space_message_reactions enable row level security;
create policy "members read message reactions" on public.tfr_space_message_reactions for select to authenticated
using (exists(
  select 1 from public.tfr_space_messages message
  where message.id=message_id and public.tfr_is_member(message.space_id)
));
create policy "members manage own message reactions" on public.tfr_space_message_reactions for all to authenticated
using (user_id=auth.uid() and exists(
  select 1 from public.tfr_space_messages message
  where message.id=message_id and public.tfr_is_member(message.space_id)
)) with check (user_id=auth.uid() and exists(
  select 1 from public.tfr_space_messages message
  where message.id=message_id and public.tfr_is_member(message.space_id)
));

create or replace function public.tfr_get_space_chat_meta(target_space_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'reactions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'messageId',reaction.message_id,
        'emoji',reaction.emoji,
        'count',reaction.reaction_count,
        'reacted',reaction.reacted
      ))
      from (
        select item.message_id,item.emoji,count(*)::integer as reaction_count,
          bool_or(item.user_id=auth.uid()) as reacted
        from public.tfr_space_message_reactions item
        join public.tfr_space_messages message on message.id=item.message_id
        where message.space_id=target_space_id and message.deleted_at is null
        group by item.message_id,item.emoji
      ) reaction
    ),'[]'::jsonb),
    'blockedUsers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',profile.user_id,
        'login',profile.twitch_login,
        'displayName',profile.display_name,
        'avatarUrl',profile.avatar_url
      ) order by profile.display_name)
      from public.tfr_space_chat_blocks block
      join public.tfr_profiles profile on profile.user_id=block.blocked_user_id
      where block.user_id=auth.uid()
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.tfr_toggle_space_message_reaction(target_message_id uuid,target_emoji text)
returns boolean language plpgsql security definer set search_path=public as $$
declare target_space_id uuid; removed_count integer;
begin
  if target_emoji not in ('👍','❤️','😂','👀') then raise exception 'invalid_reaction'; end if;
  select space_id into target_space_id from public.tfr_space_messages
  where id=target_message_id and deleted_at is null and kind='message';
  if target_space_id is null or not public.tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  delete from public.tfr_space_message_reactions
  where message_id=target_message_id and user_id=auth.uid() and emoji=target_emoji;
  get diagnostics removed_count = row_count;
  if removed_count=0 then
    insert into public.tfr_space_message_reactions(message_id,user_id,emoji)
    values(target_message_id,auth.uid(),target_emoji);
    return true;
  end if;
  return false;
end $$;

grant execute on function public.tfr_get_space_chat_meta(uuid) to authenticated;
grant execute on function public.tfr_toggle_space_message_reaction(uuid,text) to authenticated;
revoke all on function public.tfr_get_space_chat_meta(uuid) from public;
revoke all on function public.tfr_toggle_space_message_reaction(uuid,text) from public;
