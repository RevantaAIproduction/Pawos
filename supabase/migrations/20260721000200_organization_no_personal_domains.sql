-- PawOS Settings Foundation — Block personal email domains from organizations
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260721000100_organization_domain_restriction.sql.
--
-- Team and Enterprise are for organizations, not individuals — this is the
-- real backend enforcement (the app also checks client-side first, see
-- src/shared/organization/PersonalEmailDomains.ts, which this list must be
-- kept in sync with by hand since SQL and TypeScript can't share source).

create or replace function is_personal_email_domain(check_domain text)
returns boolean
language sql
immutable
as $$
  select lower(trim(check_domain)) in (
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
    'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'gmx.com', 'gmx.net',
    'zoho.com',
    'mail.com',
    'yandex.com', 'yandex.ru',
    'rediffmail.com',
    'inbox.com',
    'fastmail.com'
  );
$$;

alter table organizations drop constraint if exists organizations_domain_not_personal;
alter table organizations add constraint organizations_domain_not_personal
  check (not is_personal_email_domain(domain));
