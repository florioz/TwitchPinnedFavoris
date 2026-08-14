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
