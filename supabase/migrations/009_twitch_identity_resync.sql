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
