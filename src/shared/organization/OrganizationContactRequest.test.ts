import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_CONTACT_SUBJECT,
  PAWOS_SALES_EMAIL,
  isManagedByPawos,
  organizationContactBody,
  organizationContactMailto,
  planLabel,
} from './OrganizationContactRequest';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

/**
 * Team and Enterprise organizations are set up and changed by PawOS. The customer's way in is an
 * email they write themselves, started from a prefilled draft.
 */
describe('which plans PawOS manages', () => {
  it('Team and Enterprise — and nothing else', () => {
    expect(isManagedByPawos('team')).toBe(true);
    expect(isManagedByPawos('enterprise')).toBe(true);
    for (const tier of ['go', 'pro', 'proMax', 'build', '', null, undefined, 'Team', 'TEAM']) expect(isManagedByPawos(tier), String(tier)).toBe(false);
  });
});

describe('the contact email', () => {
  const full = { organizationName: 'PawOS Test Team', tier: 'team', ownerName: 'Tharun Esta', ownerEmail: 'tharun@revantaai.com', domain: 'revantaai.com', seatCount: 5, occupiedSeats: 2 };
  const parts = (url: string) => {
    const [address, query = ''] = url.replace(/^mailto:/, '').split('?');
    const params = new URLSearchParams(query);
    return { address, subject: params.get('subject'), body: params.get('body') };
  };

  it('goes to the sales address PawOS already publishes — the same one the website uses', () => {
    expect(PAWOS_SALES_EMAIL).toBe('sales@revantaai.com');
    expect(read('pawos-web/src/lib/config/contactConfig.ts')).toContain('sales: "sales@revantaai.com"');
    expect(parts(organizationContactMailto(full)).address).toBe('sales@revantaai.com');
  });

  it('has the agreed subject and a body filled with what is known', () => {
    const { subject, body } = parts(organizationContactMailto(full));
    expect(subject).toBe('PawOS Team/Enterprise — Organization Management Request');
    expect(subject).toBe(ORGANIZATION_CONTACT_SUBJECT);
    expect(body).toBe(
      [
        'Hello PawOS Team,',
        '',
        'I would like assistance with managing our PawOS organization.',
        '',
        'Organization: PawOS Test Team',
        'Plan: Team',
        'Owner/admin: Tharun Esta',
        'Owner/admin email: tharun@revantaai.com',
        'Organization domain: revantaai.com',
        'Current members/seats: 2 active members, 5 seats',
        'Additional seats requested: ',
        'Credit/compute requirements: ',
        'Additional requirements: ',
        '',
        'Please assist us with member invitations, seat allocation, organization configuration, and plan or billing changes.',
        '',
        'Thank you.',
      ].join('\r\n')
    );
  });

  it('Enterprise is named as Enterprise', () => {
    expect(organizationContactBody({ ...full, tier: 'enterprise' })).toContain('Plan: Enterprise');
    expect(planLabel('team')).toBe('Team');
    expect(planLabel('enterprise')).toBe('Enterprise');
  });

  it('what is not known is left blank for the customer to fill in — never invented', () => {
    const body = organizationContactBody({});
    for (const label of ['Organization: ', 'Plan: ', 'Owner/admin: ', 'Owner/admin email: ', 'Organization domain: ', 'Current members/seats: ']) {
      expect(body.split('\r\n')).toContain(label);
    }
    expect(body).not.toMatch(/undefined|null|NaN|\[object/);
    // No seat count on record: only the members are stated — no seat number is made up.
    expect(organizationContactBody({ seatCount: null, occupiedSeats: 3 })).toContain('Current members/seats: 3 active members\r\n');
    expect(organizationContactBody({ seatCount: 0, occupiedSeats: 1 })).toContain('Current members/seats: 1 active member\r\n');
    expect(organizationContactBody({ seatCount: 1, occupiedSeats: 1 })).toContain('Current members/seats: 1 active member, 1 seat\r\n');
    expect(() => organizationContactMailto({ organizationName: null, tier: undefined, ownerName: null, ownerEmail: null, seatCount: null, occupiedSeats: null })).not.toThrow();
  });

  it('there is no mobile number line: PawOS does not hold one, and none is invented', () => {
    expect(organizationContactBody(full)).not.toMatch(/mobile|phone/i);
  });

  it('the domain is written without a leading "@", whichever way it is given', () => {
    expect(organizationContactBody({ ...full, domain: '@revantaai.com' })).toContain('Organization domain: revantaai.com\r\n');
  });

  it('a value cannot add lines, headers or another recipient to the draft', () => {
    const url = organizationContactMailto({ ...full, organizationName: 'Acme\r\nBcc: attacker@evil.io\r\n\r\nPay invoice 123', ownerEmail: 'a@b.com&cc=attacker@evil.io&subject=Hijacked' });
    const { address, subject, body } = parts(url);
    expect(address).toBe('sales@revantaai.com');
    expect(subject).toBe(ORGANIZATION_CONTACT_SUBJECT);
    expect(new URLSearchParams(url.split('?')[1]).has('cc')).toBe(false);
    expect(new URLSearchParams(url.split('?')[1]).has('bcc')).toBe(false);
    expect(body!.split('\r\n').filter((l) => l.startsWith('Organization:'))).toEqual(['Organization: Acme Bcc: attacker@evil.io Pay invoice 123']);
    expect(body!.split('\r\n')).toHaveLength(17);
  });

  it('carries nothing private: no ids, tokens, internal allowances or costs', () => {
    const body = organizationContactBody({ ...full, organizationName: 'Org' });
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|token|allowance|micro|private|provider|secret/i);
  });

  it('is a link the desktop app will open: an email to PawOS itself, with no spaces in it', () => {
    const url = organizationContactMailto(full);
    // The same rule as src/main/execution/plugins/OpenUrlPlugin.ts (isPawosMailto).
    expect(read('src/main/execution/plugins/OpenUrlPlugin.ts')).toContain('/^mailto:[a-z0-9._-]+@revantaai\\.com(\\?[^\\s]*)?$/i');
    expect(/^mailto:[a-z0-9._-]+@revantaai\.com(\?[^\s]*)?$/i.test(url)).toBe(true);
    expect(url.length).toBeLessThan(1900);
  });
});

describe('the Members screen for a Team or Enterprise organization', () => {
  const screen = read('src/renderer/ui/Dashboard/sections/OrganizationSection.tsx');

  it('offers Contact PawOS in place of the invite form', () => {
    expect(screen).toContain('data-testid="org-contact-pawos"');
    expect(screen).toContain('Contact PawOS');
    expect(screen).toContain('{canManageMembers(myRole) && !managedByPawos && (');
    // The invite button and its fields exist only inside the block that is not shown for these plans.
    const inviteForm = screen.slice(screen.indexOf('{canManageMembers(myRole) && !managedByPawos && ('));
    expect(inviteForm.indexOf('onClick={inviteMember}')).toBeGreaterThan(-1);
    expect(screen.slice(0, screen.indexOf('{canManageMembers(myRole) && !managedByPawos && (')).includes('onClick={inviteMember}')).toBe(false);
  });

  it('hides seat reassignment and seat-change requests, and the seat checkout cannot open', () => {
    expect(screen).toContain("{m.status === 'invited' && canManageMembers(myRole) && !managedByPawos && (");
    expect(screen).toContain("{m.status !== 'invited' && canManageBilling(myRole) && !managedByPawos && (");
    expect(screen).toContain('{seatCheckoutIntent && !managedByPawos && (');
  });

  it('the three actions refuse too, whatever called them', () => {
    expect(screen).toContain('if (!org || managedByPawos || !inviteEmail.trim()) return;');
    expect(screen.match(/if \(!org \|\| managedByPawos\) return;/g)).toHaveLength(2);
  });

  it('opening the email only opens it: one openUrl with the mailto link, and no purchase, request or record', () => {
    const start = screen.indexOf('const contactPawos = () => {');
    const fn = screen.slice(start, screen.indexOf('async function inviteMember()', start));
    expect(fn).toContain("type: 'openUrl'");
    expect(fn).toContain('organizationContactMailto(');
    expect(fn).not.toMatch(/organizationService\.|helpCreateConversation|setSeatCheckoutIntent|billing|Razorpay|setSeatRequestMessage|mailSend/);
  });

  it('Remove stays for the roles that had it, and only them', () => {
    expect(screen).toMatch(/\{canManageMembers\(myRole\) && \(\s*<button type="button" className=\{styles\.primaryButton\} onClick=\{\(\) => removeMember\(m\.id\)\}>\s*Remove/);
    const permissions = read('src/shared/organization/OrgPermissions.ts');
    expect(permissions).toContain('export function canManageMembers');
  });

  it('shows the owner and the seats from the records it already has, and nothing it does not hold', () => {
    expect(screen).toContain('data-testid="org-owner"');
    expect(screen).toContain('data-testid="org-seats"');
    expect(screen).toContain('{activeSeats} of {org.seatCount} in use');
    expect(screen).not.toMatch(/mobile|phone number/i);
  });

  it('an organization on another tier keeps its invite form', () => {
    // The only condition added to the form is the Team/Enterprise one.
    expect(screen.match(/!managedByPawos/g)!.length).toBe(4);
    expect(screen).toContain('const managedByPawos = isManagedByPawos(org?.tier);');
  });
});

describe('the upgrade screens', () => {
  const upgrade = read('src/renderer/ui/Dashboard/sections/UpgradeSection.tsx');

  it('asking to check out Team or Enterprise opens Contact sales — never a checkout', () => {
    const start = upgrade.indexOf('const startCheckout = ');
    const fn = upgrade.slice(start, upgrade.indexOf('};', start));
    expect(fn).toMatch(/if \(tier === 'team' \|\| tier === 'enterprise'\) \{\s*setSalesPlan\(tier\);\s*return;/);
    expect(fn).not.toContain('setShowEnterpriseCheckout(true)');
    expect(upgrade).not.toContain('setShowEnterpriseCheckout(true)');
    expect(upgrade).not.toMatch(/setTeamCheckoutSeatTier\('(standard|premium)'\)/);
  });

  it('the Team and Enterprise tab is the contact-sales panel', () => {
    expect(upgrade).toMatch(/tab === 'team' \? \(\s*<OrgPlansPanel currentTier=\{currentTier\} onContactSales=\{setSalesPlan\} \/>/);
    const panel = read('src/renderer/ui/Dashboard/sections/OrgPlansPanel.tsx');
    expect(panel).not.toMatch(/Razorpay|checkout-tier|createNative|billingWebPost/);
  });

  it('nothing on the contact page claims a request was submitted or a plan changed', () => {
    const contact = read('src/renderer/ui/Dashboard/sections/ContactSalesPage.tsx');
    expect(contact).not.toMatch(/request (was )?(submitted|received|pending)|upgrade(d)? (is )?complete|order is complete/i);
  });

  it('every sales link on Desktop uses the one address', () => {
    expect(read('src/renderer/ui/Dashboard/sections/ContactSalesPage.tsx')).toContain('const SALES_EMAIL = PAWOS_SALES_EMAIL;');
    const older = read('src/renderer/ui/Dashboard/sections/TierPurchasePanel.tsx');
    expect(older).toContain('mailto:${PAWOS_SALES_EMAIL}?subject=');
    expect(older).toContain("import { PAWOS_SALES_EMAIL } from '../../../../shared/organization/OrganizationContactRequest';");
    expect(older).not.toContain('mailto:pawos@revantaai.com');
  });

  it('Pro and Pro Max still start their own checkout', () => {
    const start = upgrade.indexOf('const startCheckout = ');
    const fn = upgrade.slice(start, upgrade.indexOf('};', start));
    expect(fn).toContain("setTierCheckoutTier(tier as Exclude<SubscriptionTierId, 'go'>);");
  });
});
