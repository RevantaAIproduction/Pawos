/**
 * Free/personal consumer email providers — Team and Enterprise are for
 * organizations, not individuals, so these domains can never back a
 * PawOS organization. Kept in sync manually with the Postgres copy of
 * this list (supabase/migrations/20260721000200_organization_no_personal_domains.sql)
 * since SQL and TypeScript can't share source directly — the DB function
 * is the real enforcement; this one exists so the app can reject before
 * ever calling Supabase.
 */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'yahoo.ca',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'zoho.com',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'rediffmail.com',
  'inbox.com',
  'fastmail.com',
]);

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}
