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
