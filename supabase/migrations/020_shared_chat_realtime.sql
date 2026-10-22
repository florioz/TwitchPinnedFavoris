-- Private invalidations; no message content or user identity is broadcast.
create policy "space members receive chat changes"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and
  case when realtime.topic() ~ '^tfr-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.tfr_is_member(substring(realtime.topic() from 10)::uuid)
    else false end
);

create or replace function public.tfr_notify_chat_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if TG_TABLE_NAME = 'tfr_space_messages' then
    if TG_OP = 'DELETE' then target := OLD.space_id; else target := NEW.space_id; end if;
  else
    if TG_OP = 'DELETE' then
      select space_id into target from public.tfr_space_messages where id = OLD.message_id;
    else
      select space_id into target from public.tfr_space_messages where id = NEW.message_id;
    end if;
  end if;
  if target is not null then
    perform realtime.send('{}'::jsonb, 'changed', 'tfr-chat:' || target::text, true);
  end if;
  return null;
end;
$$;
revoke all on function public.tfr_notify_chat_change() from public, anon, authenticated;
create trigger tfr_chat_message_changed after insert or update or delete on public.tfr_space_messages
for each row execute function public.tfr_notify_chat_change();
create trigger tfr_chat_reaction_changed after insert or update or delete on public.tfr_space_message_reactions
for each row execute function public.tfr_notify_chat_change();
