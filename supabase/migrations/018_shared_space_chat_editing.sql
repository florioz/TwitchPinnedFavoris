alter table public.tfr_space_messages
  add column if not exists edited_at timestamptz;

create or replace function public.tfr_edit_space_message(target_message_id uuid,message_body text)
returns boolean language plpgsql security definer set search_path=public as $$
declare normalized_body text;
begin
  normalized_body := trim(coalesce(message_body,''));
  if char_length(normalized_body) < 1 or char_length(normalized_body) > 500 then
    raise exception 'invalid_message_length';
  end if;
  update public.tfr_space_messages
  set body=normalized_body,edited_at=now()
  where id=target_message_id and author_id=auth.uid() and kind='message' and deleted_at is null;
  if not found then raise exception 'forbidden'; end if;
  return true;
end $$;

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
    'editedMessages',coalesce((
      select jsonb_agg(jsonb_build_object('messageId',message.id,'editedAt',message.edited_at))
      from public.tfr_space_messages message
      where message.space_id=target_space_id and message.edited_at is not null
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

grant execute on function public.tfr_edit_space_message(uuid,text) to authenticated;
revoke all on function public.tfr_edit_space_message(uuid,text) from public;
