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
