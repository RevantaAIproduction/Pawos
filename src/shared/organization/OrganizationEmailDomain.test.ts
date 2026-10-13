import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { checkInviteEmail, emailDomainOf, normalizeOrgDomain, organizationInviteDomain } from './OrganizationEmailDomain';

/**
 * Inviting a teammate: their email must be on the organization's domain. The reported bug — an
 * organization whose stored domain is empty refused every address, with "an @ email" — is the first
 * group below.
 */
describe('an organization with no stored domain (created before the domain was recorded)', () => {
  it('tharun@revantaai.com can invite pawos@revantaai.com: the domain is the owner’s', () => {
    expect(checkInviteEmail('pawos@revantaai.com', '', 'tharun@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('pawos@revantaai.com', null, 'tharun@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('pawos@revantaai.com', undefined, 'tharun@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('pawos@revantaai.com', '   ', 'tharun@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
  });

  it('it is still one domain: an address elsewhere is refused, and the message names the domain', () => {
    expect(checkInviteEmail('someone@gmail.com', '', 'tharun@revantaai.com')).toEqual({
      ok: false,
      reason: 'This organization only accepts teammates with an @revantaai.com email.',
    });
  });

  it('the message never reads "an @ email"', () => {
    for (const stored of ['', null, undefined, ' ']) {
      for (const owner of ['tharun@revantaai.com', '', null]) {
        const result = checkInviteEmail('someone@example.org', stored, owner);
        if (!result.ok) expect(result.reason).not.toMatch(/@ email|@undefined|@null/);
      }
    }
  });

  it('with no owner email known either, a valid address is passed on for the database to decide', () => {
    expect(checkInviteEmail('pawos@revantaai.com', '', '')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('not-an-email', '', '')).toEqual({ ok: false, reason: 'Enter a valid email address.' });
  });
});

describe('an organization with a stored domain', () => {
  it('the same domain is accepted', () => {
    expect(checkInviteEmail('pawos@revantaai.com', 'revantaai.com', 'tharun@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
  });

  it('PawOS Test Team as it is stored now (revantaai.com): pawos@ is accepted, gmail.com and otherdomain.com are refused by name', () => {
    const check = (email: string) => checkInviteEmail(email, 'revantaai.com', 'tharun@revantaai.com');
    expect(check('pawos@revantaai.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    for (const email of ['someone@gmail.com', 'someone@otherdomain.com']) {
      expect(check(email), email).toEqual({ ok: false, reason: 'This organization only accepts teammates with an @revantaai.com email.' });
    }
  });

  it('the stored domain wins over the owner’s email', () => {
    expect(checkInviteEmail('new@acme.com', 'acme.com', 'owner@elsewhere.io').ok).toBe(true);
    expect(checkInviteEmail('new@elsewhere.io', 'acme.com', 'owner@elsewhere.io').ok).toBe(false);
  });

  it('a different domain is refused — including lookalikes, subdomains and suffixes', () => {
    for (const email of ['x@gmail.com', 'x@revantaai.co', 'x@revantaai.com.evil.io', 'x@mail.revantaai.com', 'x@notrevantaai.com', 'x@revantaai.comm']) {
      expect(checkInviteEmail(email, 'revantaai.com', 'tharun@revantaai.com'), email).toEqual({
        ok: false,
        reason: 'This organization only accepts teammates with an @revantaai.com email.',
      });
    }
  });

  it('upper case and surrounding spaces do not matter, on either side', () => {
    expect(checkInviteEmail('  Pawos@RevantaAI.COM  ', 'revantaai.com', null)).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('pawos@revantaai.com', '  RevantaAI.com ', null)).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('pawos@revantaai.com', '@revantaai.com', null)).toEqual({ ok: true, email: 'pawos@revantaai.com' });
    expect(checkInviteEmail('PAWOS@REVANTAAI.COM', '', 'Tharun@RevantaAI.com')).toEqual({ ok: true, email: 'pawos@revantaai.com' });
  });

  it('malformed addresses are refused before any domain is compared', () => {
    for (const email of ['', '   ', 'pawos', 'pawos@', '@revantaai.com', 'pawos@revantaai', 'pa wos@revantaai.com', 'pawos@revan taai.com', 'a@b@revantaai.com', 'pawos@@revantaai.com', 'pawos@revantaai.com, other@revantaai.com']) {
      expect(checkInviteEmail(email, 'revantaai.com', 'tharun@revantaai.com'), JSON.stringify(email)).toEqual({ ok: false, reason: 'Enter a valid email address.' });
    }
  });

  it('an address with a second "@" cannot borrow the organization’s domain', () => {
    expect(emailDomainOf('attacker@evil.io@revantaai.com')).toBe('');
    expect(checkInviteEmail('attacker@revantaai.com@evil.io', 'revantaai.com', null).ok).toBe(false);
  });
});

describe('the pieces', () => {
  it('emailDomainOf', () => {
    expect(emailDomainOf('Tharun@RevantaAI.com')).toBe('revantaai.com');
    expect(emailDomainOf('  a.b+tag@sub.example.co.uk ')).toBe('sub.example.co.uk');
    expect(emailDomainOf(null)).toBe('');
    expect(emailDomainOf('nope')).toBe('');
  });

  it('normalizeOrgDomain', () => {
    expect(normalizeOrgDomain(' @RevantaAI.com ')).toBe('revantaai.com');
    expect(normalizeOrgDomain(null)).toBe('');
  });

  it('organizationInviteDomain', () => {
    expect(organizationInviteDomain('acme.com', 'x@other.io')).toBe('acme.com');
    expect(organizationInviteDomain('', 'x@other.io')).toBe('other.io');
    expect(organizationInviteDomain('', '')).toBe('');
  });
});

describe('the Members screen uses this check, and the database stays the authority', () => {
  const root = path.resolve(__dirname, '../../..');
  const screen = fs.readFileSync(path.join(root, 'src/renderer/ui/Dashboard/sections/OrganizationSection.tsx'), 'utf8');

  it('both places that take a teammate’s email go through checkInviteEmail — neither compares against org.domain itself', () => {
    expect(screen.match(/checkInviteEmail\(/g)).toHaveLength(2);
    expect(screen).not.toMatch(/!== org\.domain/);
    expect(screen).not.toMatch(/@\$\{org\??\.domain\}/);
  });

  it('the database trigger that enforces the domain is unchanged', () => {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260721000100_organization_domain_restriction.sql'), 'utf8');
    expect(sql).toContain("lower(split_part(new.email, '@', 2)) <> lower(org_domain)");
    expect(sql).toContain('before insert or update of email on organization_members');
  });
});
