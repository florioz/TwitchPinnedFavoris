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
