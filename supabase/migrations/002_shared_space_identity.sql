create or replace function public.tfr_get_space(target_space_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
  if not tfr_is_member(target_space_id) then raise exception 'forbidden'; end if;
  select jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'ownerId',s.owner_id,
    'currentMemberId',auth.uid(),'favorites',s.payload->'favorites','categories',s.payload->'categories',
    'revision',s.revision,'syncState','synced','members',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'displayName',p.display_name,
      'avatarUrl',p.avatar_url,'role',m.role)), '[]'::jsonb)
     from tfr_space_members m join tfr_profiles p on p.user_id=m.user_id where m.space_id=s.id)) into result
  from tfr_spaces s where s.id=target_space_id;
  return result;
end $$;

grant execute on function public.tfr_get_space(uuid) to authenticated;
