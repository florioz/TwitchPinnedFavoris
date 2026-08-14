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
