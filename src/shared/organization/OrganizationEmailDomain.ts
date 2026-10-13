/**
 * An organization is scoped to one email domain — its creator's (see
 * supabase/migrations/20260721000100_organization_domain_restriction.sql): every member's email must
 * be on it. The database trigger there is the authority; this is the app's own check, run first so
 * the person inviting gets a clear answer instead of a database error.
 *
 * Organizations created before the domain was recorded have an empty stored domain. For those the
 * domain is the one their owner's email is on — the same rule the stored value comes from — never
 * "no domain matches", which is what comparing against the empty value amounts to.
 */

/** The domain part of an email address, lower-cased; '' when the text is not one address. */
export function emailDomainOf(email: string | null | undefined): string {
  const text = (email ?? '').trim().toLowerCase();
  // One "@", something before it, a dotted host after it, and no spaces anywhere.
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(text);
  return match?.[1] ?? '';
}

/** A stored domain as it should be compared: trimmed, lower-cased, without a leading "@". */
export function normalizeOrgDomain(domain: string | null | undefined): string {
  return (domain ?? '').trim().toLowerCase().replace(/^@+/, '');
}

/**
 * The domain invitations to this organization must be on: the stored one, or — when none is stored —
 * the owner's. '' when neither is known (the database then decides, as it always does).
 */
export function organizationInviteDomain(storedDomain: string | null | undefined, ownerEmail: string | null | undefined): string {
  return normalizeOrgDomain(storedDomain) || emailDomainOf(ownerEmail);
}

export type InviteEmailCheck = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Whether `email` may be invited to an organization. Returns the address to send on (trimmed and
 * lower-cased) or the reason to show.
 */
export function checkInviteEmail(email: string, storedDomain: string | null | undefined, ownerEmail: string | null | undefined): InviteEmailCheck {
  const normalized = email.trim().toLowerCase();
  const invitedDomain = emailDomainOf(normalized);
  if (!invitedDomain) return { ok: false, reason: 'Enter a valid email address.' };
  const required = organizationInviteDomain(storedDomain, ownerEmail);
  if (required && invitedDomain !== required) {
    return { ok: false, reason: `This organization only accepts teammates with an @${required} email.` };
  }
  return { ok: true, email: normalized };
}
