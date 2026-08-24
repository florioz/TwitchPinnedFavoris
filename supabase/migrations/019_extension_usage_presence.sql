create table if not exists public.tfr_extension_presence (
  installation_hash text primary key check (installation_hash ~ '^[0-9a-f]{64}$'),
  extension_version text not null default '',
  extension_environment text not null default '',
  last_seen timestamptz not null default now()
);

create index if not exists tfr_extension_presence_last_seen_idx
  on public.tfr_extension_presence(last_seen desc);

alter table public.tfr_extension_presence enable row level security;
revoke all on table public.tfr_extension_presence from anon, authenticated;

create or replace function public.tfr_get_extension_presence_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.tfr_extension_presence
  where last_seen >= now() - interval '2 minutes';
$$;

create or replace function public.tfr_touch_extension_presence(
  target_installation_hash text,
  target_extension_version text default '',
  target_extension_environment text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_installation_hash is null or target_installation_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_installation_hash';
  end if;

  insert into public.tfr_extension_presence (
    installation_hash,
    extension_version,
    extension_environment,
    last_seen
  ) values (
    target_installation_hash,
    left(coalesce(target_extension_version, ''), 32),
    left(coalesce(target_extension_environment, ''), 64),
    now()
  )
  on conflict (installation_hash) do update set
    extension_version = excluded.extension_version,
    extension_environment = excluded.extension_environment,
    last_seen = excluded.last_seen;

  delete from public.tfr_extension_presence
  where last_seen < now() - interval '7 days';

  return public.tfr_get_extension_presence_count();
end;
$$;

create or replace function public.tfr_remove_extension_presence(target_installation_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_installation_hash is null or target_installation_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_installation_hash';
  end if;
  delete from public.tfr_extension_presence item
  where item.installation_hash = target_installation_hash;
  return true;
end;
$$;

revoke all on function public.tfr_get_extension_presence_count() from public;
revoke all on function public.tfr_touch_extension_presence(text, text, text) from public;
revoke all on function public.tfr_remove_extension_presence(text) from public;
grant execute on function public.tfr_get_extension_presence_count() to anon, authenticated;
grant execute on function public.tfr_touch_extension_presence(text, text, text) to anon, authenticated;
grant execute on function public.tfr_remove_extension_presence(text) to anon, authenticated;
