-- PawOS Settings Foundation — Organization domain restriction
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260720000000_help_center_phase1.sql and
-- 20260721000000_settings_foundation_device_sessions.sql.
--
-- An organization is scoped to a single email domain (derived from the
-- creator's email at creation time, e.g. "acme.com") — every member's email
-- must be on that domain, same pattern Slack/Google Workspace use. Enforced
-- twice: the app validates before ever calling Supabase (fast, friendly
-- error), and this trigger is the real backstop (a client bug or a direct
-- API call can't bypass it).

alter table organizations add column if not exists domain text not null default '';

create or replace function enforce_member_email_domain()
returns trigger
language plpgsql
as $$
declare
  org_domain text;
begin
  select domain into org_domain from organizations where id = new.organization_id;
  if org_domain is not null and org_domain <> '' and lower(split_part(new.email, '@', 2)) <> lower(org_domain) then
    raise exception 'Email % is not on this organization''s domain (@%)', new.email, org_domain;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_member_email_domain on organization_members;
create trigger trg_enforce_member_email_domain
  before insert or update of email on organization_members
  for each row execute function enforce_member_email_domain();
