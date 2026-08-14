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
