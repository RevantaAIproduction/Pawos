/**
 * Team and Enterprise organizations are set up and changed by PawOS: members, seats, credits and
 * plan changes go through PawOS sales, not a self-service form. This builds the email a customer
 * sends to ask — a `mailto:` link that opens their own mail app with an editable draft. Nothing is
 * sent by PawOS, no request is recorded, and nothing is granted by opening it.
 */

/** Revanta AI's sales address (the same one as pawos-web/src/lib/config/contactConfig.ts). */
export const PAWOS_SALES_EMAIL = 'sales@revantaai.com';

export const ORGANIZATION_CONTACT_SUBJECT = 'PawOS Team/Enterprise — Organization Management Request';

/** Plans whose members, seats and billing are managed by PawOS rather than by the customer. */
export function isManagedByPawos(tier: string | null | undefined): boolean {
  return tier === 'team' || tier === 'enterprise';
}

export interface OrganizationContactDetails {
  organizationName?: string | null;
  /** 'team' | 'enterprise' (or any other tier label to show as given). */
  tier?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  /** The organization's email domain, without the "@". */
  domain?: string | null;
  /** Seats the organization has on record. */
  seatCount?: number | null;
  /** Seats held by active members. */
  occupiedSeats?: number | null;
}

/** One line of text for a mail body: no line breaks or control characters, and not endless. */
function line(value: string | null | undefined): string {
  return (value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function planLabel(tier: string | null | undefined): string {
  if (tier === 'team') return 'Team';
  if (tier === 'enterprise') return 'Enterprise';
  return line(tier);
}

/**
 * The draft's body. A value PawOS has is filled in; one it doesn't have is left blank for the
 * customer to complete — never invented. Only what the customer can already see about their own
 * organization goes in: no ids, tokens, internal allowances or billing internals.
 */
export function organizationContactBody(details: OrganizationContactDetails): string {
  // Only what is on record: the active members, and the seat count when PawOS has one.
  const members = typeof details.occupiedSeats === 'number' && details.occupiedSeats >= 0 ? `${details.occupiedSeats} active member${details.occupiedSeats === 1 ? '' : 's'}` : '';
  const seats = typeof details.seatCount === 'number' && details.seatCount > 0 ? `${details.seatCount} seat${details.seatCount === 1 ? '' : 's'}` : '';
  const domain = line(details.domain).replace(/^@+/, '');
  return [
    'Hello PawOS Team,',
    '',
    'I would like assistance with managing our PawOS organization.',
    '',
    `Organization: ${line(details.organizationName)}`,
    `Plan: ${planLabel(details.tier)}`,
    `Owner/admin: ${line(details.ownerName)}`,
    `Owner/admin email: ${line(details.ownerEmail)}`,
    `Organization domain: ${domain}`,
    `Current members/seats: ${[members, seats].filter(Boolean).join(', ')}`,
    'Additional seats requested: ',
    'Credit/compute requirements: ',
    'Additional requirements: ',
    '',
    'Please assist us with member invitations, seat allocation, organization configuration, and plan or billing changes.',
    '',
    'Thank you.',
  ].join('\r\n');
}

/** The `mailto:` link: PawOS sales, the subject, and the editable body. */
export function organizationContactMailto(details: OrganizationContactDetails): string {
  return `mailto:${PAWOS_SALES_EMAIL}?subject=${encodeURIComponent(ORGANIZATION_CONTACT_SUBJECT)}&body=${encodeURIComponent(organizationContactBody(details))}`;
}
