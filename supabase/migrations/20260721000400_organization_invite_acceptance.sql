-- PawOS — Organization invite acceptance
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260721000300_fix_organization_members_rls_recursion.sql.
--
-- inviteMember() creates an organization_members row with status='invited'
-- and no user_id (the invitee hasn't signed in yet, so there's no auth.uid()
-- to attach). Nothing previously linked that row to the invitee's real
-- account once they did sign in — org_members_select_own_org requires
-- status='active' to see a row at all, so an invited user had no way to
-- even discover the invite existed, let alone accept it. These two
-- security-definer functions are the fix: list_my_pending_invites() lets a
-- signed-in user see invites addressed to their own email (bypassing RLS,
-- since they aren't an active member yet and can't be granted a normal
-- SELECT policy for that), and accept_organization_invite() links their
-- auth.uid() to the row and flips it to active, checked against their own
-- JWT email so one user can never accept another's invite.

create or replace function list_my_pending_invites()
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  role text
)
language sql
security definer
stable
as $$
  select om.organization_id, o.name, o.slug, om.role
  from organization_members om
  join organizations o on o.id = om.organization_id
  where lower(om.email) = lower(auth.jwt() ->> 'email')
    and om.status = 'invited';
$$;

create or replace function accept_organization_invite(p_organization_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_matched uuid;
begin
  update organization_members
  set user_id = auth.uid(), status = 'active', joined_at = now()
  where organization_id = p_organization_id
    and lower(email) = lower(auth.jwt() ->> 'email')
    and status = 'invited'
  returning id into v_matched;

  if v_matched is null then
    raise exception 'No pending invite found for this account on that organization.';
  end if;
end;
$$;

grant execute on function list_my_pending_invites to authenticated;
grant execute on function accept_organization_invite to authenticated;
