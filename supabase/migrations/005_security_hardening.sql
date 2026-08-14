-- Security-definer functions are not callable by PUBLIC. Only authenticated
-- extension users receive the explicit grants below.
revoke all on function public.tfr_is_member(uuid) from public;
revoke all on function public.tfr_can_edit(uuid) from public;
revoke all on function public.tfr_is_owner(uuid) from public;
revoke all on function public.tfr_list_spaces() from public;
revoke all on function public.tfr_create_space(jsonb) from public;
revoke all on function public.tfr_get_space(uuid) from public;
revoke all on function public.tfr_update_space(uuid,jsonb) from public;
revoke all on function public.tfr_invite_by_twitch_login(uuid,text,text) from public;
revoke all on function public.tfr_create_invite_link(uuid,text) from public;
revoke all on function public.tfr_list_invitations() from public;
revoke all on function public.tfr_respond_invitation(uuid,boolean) from public;
revoke all on function public.tfr_join_by_token(text) from public;
revoke all on function public.tfr_set_member_role(uuid,uuid,text) from public;
revoke all on function public.tfr_delete_space(uuid) from public;
revoke all on function public.tfr_leave_space(uuid) from public;

grant execute on function public.tfr_is_member(uuid) to authenticated;
grant execute on function public.tfr_can_edit(uuid) to authenticated;
grant execute on function public.tfr_is_owner(uuid) to authenticated;

-- User lookup is performed inside controlled RPC functions; clients do not
-- need to enumerate every Twitch account registered in the application.
drop policy if exists "profiles visible to authenticated" on public.tfr_profiles;
create policy "profiles read self" on public.tfr_profiles for select to authenticated
using (user_id=auth.uid());
