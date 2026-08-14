create or replace function public.tfr_get_space(target_space_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.tfr_is_member($1) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'id',s.id,'name',s.name,'description',s.description,'ownerId',s.owner_id,
    'currentMemberId',auth.uid(),'favorites',coalesce(s.payload->'favorites','{}'::jsonb),
    'categories',coalesce(s.payload->'categories','[]'::jsonb),
    'settings',coalesce(s.payload->'settings','{"allowMemberExport":true}'::jsonb),
    'revision',s.revision,'syncState','synced','members',
    (select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.user_id,'displayName',p.display_name,'avatarUrl',p.avatar_url,'role',m.role
    )), '[]'::jsonb) from public.tfr_space_members m
      join public.tfr_profiles p on p.user_id=m.user_id where m.space_id=s.id)
  ) into result from public.tfr_spaces s where s.id=$1;
  return result;
end $$;

create or replace function public.tfr_create_space(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare space_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  insert into public.tfr_spaces(owner_id,name,description,payload)
  values(auth.uid(),left(coalesce($1->>'name','Nouvel espace'),100),left(coalesce($1->>'description',''),240),
    jsonb_build_object('favorites',coalesce($1->'favorites','{}'::jsonb),
      'categories',coalesce($1->'categories','[]'::jsonb),
      'settings',jsonb_build_object('allowMemberExport',coalesce(($1->'settings'->>'allowMemberExport')::boolean,true))))
  returning id into space_id;
  insert into public.tfr_space_members(space_id,user_id,role) values(space_id,auth.uid(),'owner');
  return public.tfr_get_space(space_id);
end $$;

create or replace function public.tfr_update_space(target_space_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare expected_revision bigint; current_revision bigint; next_settings jsonb;
begin
  if not public.tfr_can_edit($1) then raise exception 'forbidden'; end if;
  expected_revision := case when jsonb_typeof($2->'remoteRevision')='number' then ($2->>'remoteRevision')::bigint else null end;
  select revision into current_revision from public.tfr_spaces where id=$1 for update;
  if expected_revision is not null and current_revision<>expected_revision then raise exception 'revision_conflict'; end if;
  select case when public.tfr_is_owner($1)
    then jsonb_build_object('allowMemberExport',coalesce(($2->'settings'->>'allowMemberExport')::boolean,true))
    else coalesce(space.payload->'settings','{"allowMemberExport":true}'::jsonb)
  end into next_settings from public.tfr_spaces space where space.id=$1;
  update public.tfr_spaces as space set
    name=left(coalesce($2->>'name',space.name),100), description=left(coalesce($2->>'description',space.description),240),
    payload=jsonb_build_object('favorites',coalesce($2->'favorites','{}'::jsonb),
      'categories',coalesce($2->'categories','[]'::jsonb),'settings',next_settings),
    revision=space.revision+1,updated_at=now() where space.id=$1;
  return public.tfr_get_space($1);
end $$;

grant execute on function public.tfr_get_space(uuid) to authenticated;
grant execute on function public.tfr_create_space(jsonb) to authenticated;
grant execute on function public.tfr_update_space(uuid,jsonb) to authenticated;
