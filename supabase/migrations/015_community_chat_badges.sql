alter table public.tfr_profiles
  add column if not exists community_badge_enabled boolean not null default false,
  add column if not exists community_badge_updated_at timestamptz;

create or replace function public.tfr_set_community_badge_enabled(should_enable boolean)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  normalized_enabled boolean := coalesce(should_enable, false);
  profile_login text;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;

  update public.tfr_profiles
  set community_badge_enabled=normalized_enabled,
      community_badge_updated_at=now()
  where user_id=auth.uid()
  returning twitch_login into profile_login;

  if not found then raise exception 'profile_not_found'; end if;
  if normalized_enabled and coalesce(trim(profile_login),'')='' then
    raise exception 'twitch_identity_missing';
  end if;

  return jsonb_build_object(
    'enabled',normalized_enabled,
    'login',lower(trim(profile_login))
  );
end $$;

create or replace function public.tfr_lookup_community_badges(requested_logins text[])
returns jsonb language sql stable security definer set search_path=public as $$
  with requested as (
    select distinct lower(trim(candidate)) as login
    from unnest(coalesce(requested_logins,array[]::text[])) as candidate
    where lower(trim(candidate)) ~ '^[a-z0-9_]{2,25}$'
    limit 60
  )
  select coalesce(jsonb_agg(p.twitch_login order by p.twitch_login),'[]'::jsonb)
  from public.tfr_profiles p
  join requested r on lower(trim(p.twitch_login))=r.login
  where p.community_badge_enabled=true;
$$;

revoke all on function public.tfr_set_community_badge_enabled(boolean) from public;
revoke all on function public.tfr_lookup_community_badges(text[]) from public;
grant execute on function public.tfr_set_community_badge_enabled(boolean) to authenticated;
grant execute on function public.tfr_lookup_community_badges(text[]) to anon,authenticated;
