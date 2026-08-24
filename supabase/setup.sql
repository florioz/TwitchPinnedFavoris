-- TwitchPinnedFavoris - installation Supabase complète
--
-- À exécuter une seule fois dans le SQL Editor d'un nouveau projet Supabase.
-- Ce fichier regroupe les migrations versionnées dans leur ordre d'application.

begin;

-- -----------------------------------------------------------------------------
-- 001_shared_spaces.sql
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.tfr_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  twitch_id text unique,
  twitch_login text unique not null,
  display_name text not null default '',
  avatar_url text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.tfr_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  payload jsonb not null default '{"favorites":{},"categories":[]}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tfr_space_members (
  space_id uuid not null references public.tfr_spaces(id) on delete cascade,
  user_id uuid not null references public.tfr_profiles(user_id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.tfr_space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.tfr_spaces(id) on delete cascade,
  invited_user_id uuid references public.tfr_profiles(user_id) on delete cascade,
  invited_twitch_login text,
  token_hash text unique,
  role text not null check (role in ('editor','viewer')),
  invited_by uuid not null references public.tfr_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create or replace function public.tfr_is_member(target_space_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from tfr_space_members where space_id=target_space_id and user_id=auth.uid()) $$;

create or replace function public.tfr_can_edit(target_space_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from tfr_space_members where space_id=target_space_id and user_id=auth.uid() and role in ('owner','editor')) $$;

create or replace function public.tfr_is_owner(target_space_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from tfr_space_members where space_id=target_space_id and user_id=auth.uid() and role='owner') $$;

alter table public.tfr_profiles enable row level security;
alter table public.tfr_spaces enable row level security;
alter table public.tfr_space_members enable row level security;
alter table public.tfr_space_invitations enable row level security;

create policy "profiles visible to authenticated" on public.tfr_profiles for select to authenticated using (true);
create policy "profiles update self" on public.tfr_profiles for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "members read spaces" on public.tfr_spaces for select to authenticated using (public.tfr_is_member(id));
create policy "editors update spaces" on public.tfr_spaces for update to authenticated using (public.tfr_can_edit(id)) with check (public.tfr_can_edit(id));
create policy "members read memberships" on public.tfr_space_members for select to authenticated using (public.tfr_is_member(space_id));
create policy "invitees read invitations" on public.tfr_space_invitations for select to authenticated using (invited_user_id=auth.uid() or public.tfr_is_owner(space_id));

create or replace function public.tfr_sync_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into tfr_profiles(user_id,twitch_id,twitch_login,display_name,avatar_url)
  values(new.id, coalesce(new.raw_user_meta_data->>'sub',new.raw_user_meta_data->>'provider_id'),
    lower(coalesce(new.raw_user_meta_data->>'preferred_username',new.raw_user_meta_data->>'user_name',new.id::text)),
    coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'preferred_username',''),
    coalesce(new.raw_user_meta_data->>'picture',new.raw_user_meta_data->>'avatar_url',''))
  on conflict(user_id) do update set twitch_login=excluded.twitch_login, display_name=excluded.display_name,
    avatar_url=excluded.avatar_url, updated_at=now();
  return new;
end $$;
drop trigger if exists tfr_auth_profile on auth.users;
create trigger tfr_auth_profile after insert or update on auth.users for each row execute function public.tfr_sync_profile();

create or replace function public.tfr_list_spaces() returns jsonb language sql security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'role',m.role,
  'revision',s.revision,'updatedAt',s.updated_at)), '[]'::jsonb)
from tfr_spaces s join tfr_space_members m on m.space_id=s.id where m.user_id=auth.uid(); $$;

create or replace function public.tfr_create_space(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare space_id uuid; begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 insert into tfr_spaces(owner_id,name,description,payload) values(auth.uid(),left(coalesce(payload->>'name','Nouvel espace'),100),
 left(coalesce(payload->>'description',''),240),jsonb_build_object('favorites',coalesce(payload->'favorites','{}'::jsonb),
 'categories',coalesce(payload->'categories','[]'::jsonb))) returning id into space_id;
 insert into tfr_space_members(space_id,user_id,role) values(space_id,auth.uid(),'owner');
 return tfr_get_space(space_id); end $$;

create or replace function public.tfr_get_space(target_space_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
  if not tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  select jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'ownerId',s.owner_id,
    'currentMemberId',auth.uid(),'favorites',s.payload->'favorites',
    'categories',s.payload->'categories','revision',s.revision,'syncState','synced','members',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,'avatarUrl',p.avatar_url,'role',m.role)), '[]'::jsonb)
     from tfr_space_members m join tfr_profiles p on p.user_id=m.user_id where m.space_id=s.id)) into result
  from tfr_spaces s where s.id=target_space_id; return result; end $$;

create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin if not tfr_can_edit(target_space_id) then raise exception 'forbidden'; end if;
 update tfr_spaces set name=left(coalesce(payload->>'name',name),100), description=left(coalesce(payload->>'description',description),240),
 payload=jsonb_build_object('favorites',coalesce(payload->'favorites','{}'::jsonb),'categories',coalesce(payload->'categories','[]'::jsonb)),
 revision=revision+1,updated_at=now() where id=target_space_id;
 return tfr_get_space(target_space_id); end $$;

create or replace function public.tfr_invite_by_twitch_login(target_space_id uuid,target_twitch_login text,target_role text) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_user uuid; invitation_id uuid; begin if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
 select user_id into target_user from tfr_profiles where twitch_login=lower(trim(target_twitch_login));
 if target_user is null then raise exception 'user_not_found'; end if;
 insert into tfr_space_invitations(space_id,invited_user_id,invited_twitch_login,role,invited_by)
 values(target_space_id,target_user,lower(trim(target_twitch_login)),case when target_role='editor' then 'editor' else 'viewer' end,auth.uid()) returning id into invitation_id;
 return jsonb_build_object('id',invitation_id); end $$;

create or replace function public.tfr_create_invite_link(target_space_id uuid,target_role text) returns jsonb language plpgsql security definer set search_path=public as $$
declare raw_token text:=encode(gen_random_bytes(24),'hex'); invitation_id uuid; begin if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
 insert into tfr_space_invitations(space_id,token_hash,role,invited_by) values(target_space_id,encode(digest(raw_token,'sha256'),'hex'),
 case when target_role='editor' then 'editor' else 'viewer' end,auth.uid()) returning id into invitation_id;
 return jsonb_build_object('id',invitation_id,'token',raw_token,'expiresAt',now()+interval '7 days'); end $$;

create or replace function public.tfr_list_invitations() returns jsonb language sql security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'spaceId',s.id,'spaceName',s.name,'role',i.role,'expiresAt',i.expires_at,
 'invitedBy',p.display_name)), '[]'::jsonb) from tfr_space_invitations i join tfr_spaces s on s.id=i.space_id
 join tfr_profiles p on p.user_id=i.invited_by where i.invited_user_id=auth.uid() and i.status='pending' and i.expires_at>now(); $$;

create or replace function public.tfr_respond_invitation(target_invitation_id uuid,should_accept boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare invite tfr_space_invitations; begin select * into invite from tfr_space_invitations where id=target_invitation_id and invited_user_id=auth.uid() and status='pending' and expires_at>now() for update;
 if invite.id is null then raise exception 'invitation_not_found'; end if; update tfr_space_invitations set status=case when should_accept then 'accepted' else 'declined' end where id=invite.id;
 if should_accept then insert into tfr_space_members(space_id,user_id,role) values(invite.space_id,auth.uid(),invite.role) on conflict do nothing; end if;
 return jsonb_build_object('accepted',should_accept,'spaceId',invite.space_id); end $$;

create or replace function public.tfr_join_by_token(invite_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare invite tfr_space_invitations; begin select * into invite from tfr_space_invitations where token_hash=encode(digest(invite_token,'sha256'),'hex') and status='pending' and expires_at>now() for update;
 if invite.id is null then raise exception 'invitation_not_found'; end if; insert into tfr_space_members(space_id,user_id,role) values(invite.space_id,auth.uid(),invite.role) on conflict do nothing;
 update tfr_space_invitations set status='accepted',invited_user_id=auth.uid() where id=invite.id; return tfr_get_space(invite.space_id); end $$;

grant execute on function public.tfr_list_spaces() to authenticated;
grant execute on function public.tfr_create_space(jsonb) to authenticated;
grant execute on function public.tfr_get_space(uuid) to authenticated;
grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;
grant execute on function public.tfr_invite_by_twitch_login(uuid,text,text) to authenticated;
grant execute on function public.tfr_create_invite_link(uuid,text) to authenticated;
grant execute on function public.tfr_list_invitations() to authenticated;
grant execute on function public.tfr_respond_invitation(uuid,boolean) to authenticated;
grant execute on function public.tfr_join_by_token(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 002_shared_space_identity.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_get_space(target_space_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
  if not tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  select jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'ownerId',s.owner_id,
    'currentMemberId',auth.uid(),'favorites',s.payload->'favorites','categories',s.payload->'categories',
    'revision',s.revision,'syncState','synced','members',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
      'avatarUrl',p.avatar_url,'role',m.role)), '[]'::jsonb)
     from tfr_space_members m join tfr_profiles p on p.user_id=m.user_id where m.space_id=s.id)) into result
  from tfr_spaces s where s.id=target_space_id;
  return result;
end $$;

grant execute on function public.tfr_get_space(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 003_invitation_crypto.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_create_invite_link(target_space_id uuid,target_role text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare raw_token text:=encode(extensions.gen_random_bytes(24),'hex'); invitation_id uuid;
begin
  if not public.tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
  insert into public.tfr_space_invitations(space_id,token_hash,role,invited_by)
  values(target_space_id,encode(extensions.digest(raw_token,'sha256'),'hex'),
    case when target_role='editor' then 'editor' else 'viewer' end,auth.uid())
  returning id into invitation_id;
  return jsonb_build_object('id',invitation_id,'token',raw_token,'expiresAt',now()+interval '7 days');
end $$;

create or replace function public.tfr_join_by_token(invite_token text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare invite public.tfr_space_invitations;
begin
  select * into invite from public.tfr_space_invitations
  where token_hash=encode(extensions.digest(invite_token,'sha256'),'hex')
    and status='pending' and expires_at>now() for update;
  if invite.id is null then raise exception 'invitation_not_found'; end if;
  insert into public.tfr_space_members(space_id,user_id,role)
  values(invite.space_id,auth.uid(),invite.role) on conflict do nothing;
  update public.tfr_space_invitations set status='accepted',invited_user_id=auth.uid() where id=invite.id;
  return public.tfr_get_space(invite.space_id);
end $$;

grant execute on function public.tfr_create_invite_link(uuid,text) to authenticated;
grant execute on function public.tfr_join_by_token(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 004_remote_members.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_set_member_role(target_space_id uuid,target_user_id uuid,target_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
  if target_user_id=(select owner_id from tfr_spaces where id=target_space_id) then raise exception 'owner_role_locked'; end if;
  update tfr_space_members set role=case when target_role='editor' then 'editor' else 'viewer' end
  where space_id=target_space_id and user_id=target_user_id;
  return tfr_get_space(target_space_id);
end $$;

create or replace function public.tfr_delete_space(target_space_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
  delete from tfr_spaces where id=target_space_id;
  return true;
end $$;

create or replace function public.tfr_leave_space(target_space_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if tfr_is_owner(target_space_id) then raise exception 'owner_cannot_leave'; end if;
  delete from tfr_space_members where space_id=target_space_id and user_id=auth.uid();
  return true;
end $$;

grant execute on function public.tfr_set_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.tfr_delete_space(uuid) to authenticated;
grant execute on function public.tfr_leave_space(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 005_security_hardening.sql
-- -----------------------------------------------------------------------------
-- Security-definer functions are not callable by PUBLIC. Only authenticated
-- extension users receive the explicit grants below.
revoke all on function public.tfr_is_member(uuid) from public;
revoke all on function public.tfr_can_edit(uuid) from public;
revoke all on function public.tfr_is_owner(uuid) from public;
revoke all on function public.tfr_list_spaces() from public;
revoke all on function public.tfr_create_space(jsonb) from public;
revoke all on function public.tfr_get_space(uuid) from public;
revoke all on function public.tfr_update_space(uuid,jsonb) from public;
revoke all on function public.tfr_invite_by_twitch_login(uuid,text,text) from public;
revoke all on function public.tfr_create_invite_link(uuid,text) from public;
revoke all on function public.tfr_list_invitations() from public;
revoke all on function public.tfr_respond_invitation(uuid,boolean) from public;
revoke all on function public.tfr_join_by_token(text) from public;
revoke all on function public.tfr_set_member_role(uuid,uuid,text) from public;
revoke all on function public.tfr_delete_space(uuid) from public;
revoke all on function public.tfr_leave_space(uuid) from public;

grant execute on function public.tfr_is_member(uuid) to authenticated;
grant execute on function public.tfr_can_edit(uuid) to authenticated;
grant execute on function public.tfr_is_owner(uuid) to authenticated;

-- User lookup is performed inside controlled RPC functions; clients do not
-- need to enumerate every Twitch account registered in the application.
drop policy if exists "profiles visible to authenticated" on public.tfr_profiles;
create policy "profiles read self" on public.tfr_profiles for select to authenticated
using (user_id=auth.uid());

-- -----------------------------------------------------------------------------
-- 006_pending_twitch_invitations.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_sync_profile()
returns trigger language plpgsql security definer set search_path=public as $$
declare normalized_login text;
begin
  normalized_login:=lower(coalesce(new.raw_user_meta_data->>'preferred_username',new.raw_user_meta_data->>'user_name',new.id::text));
  insert into tfr_profiles(user_id,twitch_id,twitch_login,display_name,avatar_url)
  values(new.id,coalesce(new.raw_user_meta_data->>'sub',new.raw_user_meta_data->>'provider_id'),normalized_login,
    coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'preferred_username',''),
    coalesce(new.raw_user_meta_data->>'picture',new.raw_user_meta_data->>'avatar_url',''))
  on conflict(user_id) do update set twitch_id=excluded.twitch_id,twitch_login=excluded.twitch_login,
    display_name=excluded.display_name,avatar_url=excluded.avatar_url,updated_at=now();
  update tfr_space_invitations set invited_user_id=new.id
  where invited_user_id is null and status='pending' and expires_at>now()
    and invited_twitch_login=normalized_login;
  return new;
end $$;

create or replace function public.tfr_invite_by_twitch_login(target_space_id uuid,target_twitch_login text,target_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_user uuid; invitation_id uuid; normalized_login text:=lower(trim(target_twitch_login));
begin
  if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
  if normalized_login !~ '^[a-z0-9_]{3,25}$' then raise exception 'invalid_twitch_login'; end if;
  select user_id into target_user from tfr_profiles where twitch_login=normalized_login;
  if exists(select 1 from tfr_space_members where space_id=target_space_id and user_id=target_user) then
    raise exception 'already_member';
  end if;
  if exists(select 1 from tfr_space_invitations where space_id=target_space_id
    and invited_twitch_login=normalized_login and status='pending' and expires_at>now()) then
    raise exception 'invitation_already_pending';
  end if;
  insert into tfr_space_invitations(space_id,invited_user_id,invited_twitch_login,role,invited_by)
  values(target_space_id,target_user,normalized_login,
    case when target_role='editor' then 'editor' else 'viewer' end,auth.uid())
  returning id into invitation_id;
  return jsonb_build_object('id',invitation_id,'registered',target_user is not null);
end $$;

grant execute on function public.tfr_invite_by_twitch_login(uuid,text,text) to authenticated;
revoke all on function public.tfr_invite_by_twitch_login(uuid,text,text) from public;

-- -----------------------------------------------------------------------------
-- 007_invitation_inbox_reconciliation.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_list_invitations()
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_login text; result jsonb;
begin
  select lower(trim(twitch_login)) into current_login
  from tfr_profiles where user_id=auth.uid();

  if current_login is not null and current_login <> '' then
    update tfr_space_invitations
    set invited_user_id=auth.uid()
    where invited_user_id is null
      and status='pending'
      and expires_at>now()
      and lower(trim(invited_twitch_login))=current_login;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'spaceId',s.id,
    'spaceName',s.name,
    'role',i.role,
    'expiresAt',i.expires_at,
    'invitedBy',coalesce(nullif(p.display_name,''),p.twitch_login),
    'invitedByAvatarUrl',p.avatar_url
  ) order by i.created_at desc), '[]'::jsonb)
  into result
  from tfr_space_invitations i
  join tfr_spaces s on s.id=i.space_id
  join tfr_profiles p on p.user_id=i.invited_by
  where i.invited_user_id=auth.uid()
    and i.status='pending'
    and i.expires_at>now();

  return result;
end $$;

grant execute on function public.tfr_list_invitations() to authenticated;
revoke all on function public.tfr_list_invitations() from public;

-- -----------------------------------------------------------------------------
-- 008_invitation_identity_repair.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_list_invitations()
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_login text; result jsonb;
begin
  select lower(trim(twitch_login)) into current_login
  from tfr_profiles where user_id=auth.uid();

  if current_login is not null and current_login <> '' then
    update tfr_space_invitations
    set invited_user_id=auth.uid()
    where status='pending'
      and expires_at>now()
      and lower(trim(invited_twitch_login))=current_login
      and invited_user_id is distinct from auth.uid();
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'spaceId',s.id,
    'spaceName',s.name,
    'role',i.role,
    'expiresAt',i.expires_at,
    'invitedBy',coalesce(nullif(p.display_name,''),p.twitch_login),
    'invitedByAvatarUrl',p.avatar_url
  ) order by i.created_at desc), '[]'::jsonb)
  into result
  from tfr_space_invitations i
  join tfr_spaces s on s.id=i.space_id
  join tfr_profiles p on p.user_id=i.invited_by
  where i.status='pending'
    and i.expires_at>now()
    and (
      i.invited_user_id=auth.uid()
      or (current_login is not null and lower(trim(i.invited_twitch_login))=current_login)
    );

  return result;
end $$;

create or replace function public.tfr_invite_by_twitch_login(target_space_id uuid,target_twitch_login text,target_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_user uuid; invitation_id uuid; normalized_login text:=lower(trim(target_twitch_login)); existing_invitation uuid;
begin
  if not tfr_is_owner(target_space_id) then raise exception 'forbidden'; end if;
  if normalized_login !~ '^[a-z0-9_]{3,25}$' then raise exception 'invalid_twitch_login'; end if;
  select user_id into target_user from tfr_profiles where lower(trim(twitch_login))=normalized_login;
  if target_user is not null and exists(
    select 1 from tfr_space_members where space_id=target_space_id and user_id=target_user
  ) then raise exception 'already_member'; end if;

  select id into existing_invitation
  from tfr_space_invitations
  where space_id=target_space_id
    and lower(trim(invited_twitch_login))=normalized_login
    and status='pending'
    and expires_at>now()
  order by created_at desc limit 1 for update;

  if existing_invitation is not null then
    update tfr_space_invitations
    set invited_user_id=target_user,
        role=case when target_role='editor' then 'editor' else 'viewer' end
    where id=existing_invitation;
    return jsonb_build_object('id',existing_invitation,'registered',target_user is not null,'alreadyPending',true);
  end if;

  insert into tfr_space_invitations(space_id,invited_user_id,invited_twitch_login,role,invited_by)
  values(target_space_id,target_user,normalized_login,
    case when target_role='editor' then 'editor' else 'viewer' end,auth.uid())
  returning id into invitation_id;
  return jsonb_build_object('id',invitation_id,'registered',target_user is not null,'alreadyPending',false);
end $$;

grant execute on function public.tfr_list_invitations() to authenticated;
grant execute on function public.tfr_invite_by_twitch_login(uuid,text,text) to authenticated;
revoke all on function public.tfr_list_invitations() from public;
revoke all on function public.tfr_invite_by_twitch_login(uuid,text,text) from public;

-- -----------------------------------------------------------------------------
-- 009_twitch_identity_resync.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_current_twitch_login()
returns text language plpgsql stable security definer set search_path=public,auth as $$
declare login text;
begin
  select lower(trim(coalesce(
    raw_user_meta_data->>'preferred_username',
    raw_user_meta_data->>'user_name',
    raw_user_meta_data->>'login',
    raw_user_meta_data->>'nickname'
  ))) into login
  from auth.users where id=auth.uid();
  if login is null or login='' then
    select lower(trim(twitch_login)) into login from public.tfr_profiles where user_id=auth.uid();
  end if;
  return nullif(login,'');
end $$;

create or replace function public.tfr_list_invitations()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare current_login text:=public.tfr_current_twitch_login(); result jsonb;
begin
  if current_login is not null then
    update public.tfr_profiles
    set twitch_login=current_login,updated_at=now()
    where user_id=auth.uid() and twitch_login is distinct from current_login;

    update public.tfr_space_invitations
    set invited_user_id=auth.uid()
    where status='pending' and expires_at>now()
      and lower(trim(invited_twitch_login))=current_login
      and invited_user_id is distinct from auth.uid();
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'spaceId',s.id,'spaceName',s.name,'role',i.role,'expiresAt',i.expires_at,
    'invitedBy',coalesce(nullif(p.display_name,''),p.twitch_login),'invitedByAvatarUrl',p.avatar_url
  ) order by i.created_at desc),'[]'::jsonb) into result
  from public.tfr_space_invitations i
  join public.tfr_spaces s on s.id=i.space_id
  join public.tfr_profiles p on p.user_id=i.invited_by
  where i.status='pending' and i.expires_at>now()
    and (i.invited_user_id=auth.uid() or (current_login is not null and lower(trim(i.invited_twitch_login))=current_login));
  return result;
end $$;

create or replace function public.tfr_invitation_diagnostics()
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'userId',auth.uid(),
    'twitchLogin',public.tfr_current_twitch_login(),
    'profileLogin',(select twitch_login from public.tfr_profiles where user_id=auth.uid()),
    'pendingMatches',(select count(*) from public.tfr_space_invitations
      where status='pending' and expires_at>now()
        and lower(trim(invited_twitch_login))=public.tfr_current_twitch_login())
  );
$$;

grant execute on function public.tfr_current_twitch_login() to authenticated;
grant execute on function public.tfr_list_invitations() to authenticated;
grant execute on function public.tfr_invitation_diagnostics() to authenticated;
revoke all on function public.tfr_current_twitch_login() from public;
revoke all on function public.tfr_list_invitations() from public;
revoke all on function public.tfr_invitation_diagnostics() from public;

-- -----------------------------------------------------------------------------
-- 010_fix_update_space_payload.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
<<update_space>>
begin
  if not public.tfr_can_edit(update_space.target_space_id) then
    raise exception 'forbidden';
  end if;

  update public.tfr_spaces as space
  set name=left(coalesce(update_space.payload->>'name',space.name),100),
      description=left(coalesce(update_space.payload->>'description',space.description),240),
      payload=jsonb_build_object(
        'favorites',coalesce(update_space.payload->'favorites','{}'::jsonb),
        'categories',coalesce(update_space.payload->'categories','[]'::jsonb)
      ),
      revision=space.revision+1,
      updated_at=now()
  where space.id=update_space.target_space_id;

  return public.tfr_get_space(update_space.target_space_id);
end
$$;

grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;
revoke all on function public.tfr_update_space(uuid,jsonb) from public;

-- -----------------------------------------------------------------------------
-- 011_fix_update_space_parameter_references.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.tfr_can_edit($1) then
    raise exception 'forbidden';
  end if;

  update public.tfr_spaces as space
  set name=left(coalesce($2->>'name',space.name),100),
      description=left(coalesce($2->>'description',space.description),240),
      payload=jsonb_build_object(
        'favorites',coalesce($2->'favorites','{}'::jsonb),
        'categories',coalesce($2->'categories','[]'::jsonb)
      ),
      revision=space.revision+1,
      updated_at=now()
  where space.id=$1;

  return public.tfr_get_space($1);
end
$$;

grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;
revoke all on function public.tfr_update_space(uuid,jsonb) from public;

-- -----------------------------------------------------------------------------
-- 012_sync_member_role_revision.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_set_member_role(target_space_id uuid,target_user_id uuid,target_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.tfr_is_owner($1) then raise exception 'forbidden'; end if;
  if $2=(select owner_id from public.tfr_spaces where id=$1) then raise exception 'owner_role_locked'; end if;

  update public.tfr_space_members
  set role=case when $3='editor' then 'editor' else 'viewer' end
  where space_id=$1 and user_id=$2;

  if not found then raise exception 'member_not_found'; end if;

  update public.tfr_spaces
  set revision=revision+1,updated_at=now()
  where id=$1;

  return public.tfr_get_space($1);
end $$;

grant execute on function public.tfr_set_member_role(uuid,uuid,text) to authenticated;
revoke all on function public.tfr_set_member_role(uuid,uuid,text) from public;

-- -----------------------------------------------------------------------------
-- 013_shared_space_revision_conflicts.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  expected_revision bigint;
  current_revision bigint;
begin
  if not public.tfr_can_edit($1) then
    raise exception 'forbidden';
  end if;

  expected_revision := case
    when jsonb_typeof($2->'remoteRevision') = 'number' then ($2->>'remoteRevision')::bigint
    else null
  end;

  select revision into current_revision
  from public.tfr_spaces
  where id=$1
  for update;

  if expected_revision is not null and current_revision <> expected_revision then
    raise exception 'revision_conflict';
  end if;

  update public.tfr_spaces as space
  set name=left(coalesce($2->>'name',space.name),100),
      description=left(coalesce($2->>'description',space.description),240),
      payload=jsonb_build_object(
        'favorites',coalesce($2->'favorites','{}'::jsonb),
        'categories',coalesce($2->'categories','[]'::jsonb)
      ),
      revision=space.revision+1,
      updated_at=now()
  where space.id=$1;

  return public.tfr_get_space($1);
end
$$;

grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;
revoke all on function public.tfr_update_space(uuid,jsonb) from public;

-- -----------------------------------------------------------------------------
-- 014_shared_space_export_policy.sql
-- -----------------------------------------------------------------------------
create or replace function public.tfr_get_space(target_space_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.tfr_is_member($1) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'id',s.id,'name',s.name,'description',s.description,'ownerId',s.owner_id,
    'currentMemberId',auth.uid(),'favorites',coalesce(s.payload->'favorites','{}'::jsonb),
    'categories',coalesce(s.payload->'categories','[]'::jsonb),
    'settings',coalesce(s.payload->'settings','{"allowMemberExport":true}'::jsonb),
    'revision',s.revision,'syncState','synced','members',
    (select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.user_id,'displayName',p.display_name,'avatarUrl',p.avatar_url,'role',m.role
    )), '[]'::jsonb) from public.tfr_space_members m
      join public.tfr_profiles p on p.user_id=m.user_id where m.space_id=s.id)
  ) into result from public.tfr_spaces s where s.id=$1;
  return result;
end $$;

create or replace function public.tfr_create_space(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare space_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  insert into public.tfr_spaces(owner_id,name,description,payload)
  values(auth.uid(),left(coalesce($1->>'name','Nouvel espace'),100),left(coalesce($1->>'description',''),240),
    jsonb_build_object('favorites',coalesce($1->'favorites','{}'::jsonb),
      'categories',coalesce($1->'categories','[]'::jsonb),
      'settings',jsonb_build_object('allowMemberExport',coalesce(($1->'settings'->>'allowMemberExport')::boolean,true))))
  returning id into space_id;
  insert into public.tfr_space_members(space_id,user_id,role) values(space_id,auth.uid(),'owner');
  return public.tfr_get_space(space_id);
end $$;

create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare expected_revision bigint; current_revision bigint; next_settings jsonb;
begin
  if not public.tfr_can_edit($1) then raise exception 'forbidden'; end if;
  expected_revision := case when jsonb_typeof($2->'remoteRevision')='number' then ($2->>'remoteRevision')::bigint else null end;
  select revision into current_revision from public.tfr_spaces where id=$1 for update;
  if expected_revision is not null and current_revision<>expected_revision then raise exception 'revision_conflict'; end if;
  select case when public.tfr_is_owner($1)
    then jsonb_build_object('allowMemberExport',coalesce(($2->'settings'->>'allowMemberExport')::boolean,true))
    else coalesce(space.payload->'settings','{"allowMemberExport":true}'::jsonb)
  end into next_settings from public.tfr_spaces space where space.id=$1;
  update public.tfr_spaces as space set
    name=left(coalesce($2->>'name',space.name),100), description=left(coalesce($2->>'description',space.description),240),
    payload=jsonb_build_object('favorites',coalesce($2->'favorites','{}'::jsonb),
      'categories',coalesce($2->'categories','[]'::jsonb),'settings',next_settings),
    revision=space.revision+1,updated_at=now() where space.id=$1;
  return public.tfr_get_space($1);
end $$;

grant execute on function public.tfr_get_space(uuid) to authenticated;
grant execute on function public.tfr_create_space(jsonb) to authenticated;
grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 015_community_chat_badges.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 016_shared_space_chat.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 017_shared_space_chat_reactions.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 018_shared_space_chat_editing.sql
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 019_extension_usage_presence.sql
-- -----------------------------------------------------------------------------
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

commit;
