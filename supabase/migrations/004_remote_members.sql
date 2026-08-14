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
