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
