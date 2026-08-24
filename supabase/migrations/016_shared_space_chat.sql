create table if not exists public.tfr_space_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.tfr_spaces(id) on delete cascade,
  author_id uuid references public.tfr_profiles(user_id) on delete set null,
  kind text not null default 'message' check (kind in ('message','system')),
  body text not null default '' check (char_length(body) <= 500),
  reply_to_id uuid references public.tfr_space_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tfr_space_messages_space_created_idx
  on public.tfr_space_messages(space_id, created_at desc);

create table if not exists public.tfr_space_message_reports (
  message_id uuid not null references public.tfr_space_messages(id) on delete cascade,
  reporter_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  reason text not null default 'inappropriate' check (char_length(reason) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);

create table if not exists public.tfr_space_chat_blocks (
  user_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  blocked_user_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

alter table public.tfr_space_messages enable row level security;
alter table public.tfr_space_message_reports enable row level security;
alter table public.tfr_space_chat_blocks enable row level security;

create policy "members read space messages" on public.tfr_space_messages for select to authenticated
using (public.tfr_is_member(space_id));
create policy "members create space messages" on public.tfr_space_messages for insert to authenticated
with check (public.tfr_is_member(space_id) and author_id=auth.uid() and kind='message');
create policy "authors and owners delete space messages" on public.tfr_space_messages for update to authenticated
using (author_id=auth.uid() or public.tfr_is_owner(space_id))
with check (author_id=auth.uid() or public.tfr_is_owner(space_id));
create policy "members create reports" on public.tfr_space_message_reports for insert to authenticated
with check (reporter_id=auth.uid() and exists(
  select 1 from public.tfr_space_messages message
  where message.id=message_id and public.tfr_is_member(message.space_id)
));
create policy "users manage own chat blocks" on public.tfr_space_chat_blocks for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create or replace function public.tfr_list_space_messages(
  target_space_id uuid,
  before_created_at timestamptz default null,
  requested_limit integer default 50
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(item order by item_created_at asc), '[]'::jsonb) into result
  from (
    select
      message.created_at as item_created_at,
      jsonb_build_object(
        'id',message.id,
        'spaceId',message.space_id,
        'kind',message.kind,
        'body',case when message.deleted_at is null then message.body else '' end,
        'deleted',message.deleted_at is not null,
        'createdAt',message.created_at,
        'author',jsonb_build_object(
          'id',profile.user_id,
          'login',profile.twitch_login,
          'displayName',profile.display_name,
          'avatarUrl',profile.avatar_url
        ),
        'mine',message.author_id=auth.uid(),
        'canDelete',message.author_id=auth.uid() or public.tfr_is_owner(target_space_id),
        'replyTo',case when reply.id is null then null else jsonb_build_object(
          'id',reply.id,
          'body',case when reply.deleted_at is null then left(reply.body,120) else '' end,
          'deleted',reply.deleted_at is not null,
          'authorName',reply_profile.display_name
        ) end
      ) as item
    from public.tfr_space_messages message
    left join public.tfr_profiles profile on profile.user_id=message.author_id
    left join public.tfr_space_messages reply on reply.id=message.reply_to_id
    left join public.tfr_profiles reply_profile on reply_profile.user_id=reply.author_id
    where message.space_id=target_space_id
      and (before_created_at is null or message.created_at < before_created_at)
      and not exists(
        select 1 from public.tfr_space_chat_blocks block
        where block.user_id=auth.uid() and block.blocked_user_id=message.author_id
      )
    order by message.created_at desc
    limit least(greatest(coalesce(requested_limit,50),1),100)
  ) messages;
  return result;
end $$;

create or replace function public.tfr_send_space_message(
  target_space_id uuid,
  message_body text,
  reply_to_message_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare normalized_body text; message_id uuid;
begin
  if not public.tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  normalized_body := trim(coalesce(message_body,''));
  if char_length(normalized_body) < 1 or char_length(normalized_body) > 500 then
    raise exception 'invalid_message_length';
  end if;
  if (select count(*) from public.tfr_space_messages
      where author_id=auth.uid() and kind='message' and created_at > now()-interval '10 seconds') >= 5 then
    raise exception 'rate_limited';
  end if;
  if reply_to_message_id is not null and not exists(
    select 1 from public.tfr_space_messages
    where id=reply_to_message_id and space_id=target_space_id and deleted_at is null
  ) then raise exception 'invalid_reply'; end if;
  insert into public.tfr_space_messages(space_id,author_id,body,reply_to_id)
  values(target_space_id,auth.uid(),normalized_body,reply_to_message_id)
  returning id into message_id;
  return jsonb_build_object('id',message_id);
end $$;

create or replace function public.tfr_delete_space_message(target_message_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare target_message public.tfr_space_messages;
begin
  select * into target_message from public.tfr_space_messages where id=target_message_id;
  if target_message.id is null then raise exception 'message_not_found'; end if;
  if target_message.author_id<>auth.uid() and not public.tfr_is_owner(target_message.space_id) then
    raise exception 'forbidden';
  end if;
  update public.tfr_space_messages set body='',deleted_at=now() where id=target_message_id;
  return true;
end $$;

create or replace function public.tfr_report_space_message(target_message_id uuid, report_reason text default 'inappropriate')
returns boolean language plpgsql security definer set search_path=public as $$
declare target_space_id uuid;
begin
  select space_id into target_space_id from public.tfr_space_messages where id=target_message_id and deleted_at is null;
  if target_space_id is null or not public.tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  insert into public.tfr_space_message_reports(message_id,reporter_id,reason)
  values(target_message_id,auth.uid(),left(coalesce(nullif(trim(report_reason),''),'inappropriate'),120))
  on conflict(message_id,reporter_id) do update set reason=excluded.reason,created_at=now();
  return true;
end $$;

create or replace function public.tfr_set_space_chat_block(target_user_id uuid, should_block boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if target_user_id is null or target_user_id=auth.uid() then raise exception 'invalid_user'; end if;
  if should_block then
    insert into public.tfr_space_chat_blocks(user_id,blocked_user_id)
    values(auth.uid(),target_user_id) on conflict do nothing;
  else
    delete from public.tfr_space_chat_blocks where user_id=auth.uid() and blocked_user_id=target_user_id;
  end if;
  return true;
end $$;

create or replace function public.tfr_log_space_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.revision > old.revision then
    insert into public.tfr_space_messages(space_id,author_id,kind,body)
    values(new.id,auth.uid(),'system','space_updated');
  end if;
  return new;
end $$;
drop trigger if exists tfr_space_change_chat_event on public.tfr_spaces;
create trigger tfr_space_change_chat_event after update of revision on public.tfr_spaces
for each row when (new.revision > old.revision) execute function public.tfr_log_space_change();

grant execute on function public.tfr_list_space_messages(uuid,timestamptz,integer) to authenticated;
grant execute on function public.tfr_send_space_message(uuid,text,uuid) to authenticated;
grant execute on function public.tfr_delete_space_message(uuid) to authenticated;
grant execute on function public.tfr_report_space_message(uuid,text) to authenticated;
grant execute on function public.tfr_set_space_chat_block(uuid,boolean) to authenticated;
revoke all on function public.tfr_list_space_messages(uuid,timestamptz,integer) from public;
revoke all on function public.tfr_send_space_message(uuid,text,uuid) from public;
revoke all on function public.tfr_delete_space_message(uuid) from public;
revoke all on function public.tfr_report_space_message(uuid,text) from public;
revoke all on function public.tfr_set_space_chat_block(uuid,boolean) from public;
