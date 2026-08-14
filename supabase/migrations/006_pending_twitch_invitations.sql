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
