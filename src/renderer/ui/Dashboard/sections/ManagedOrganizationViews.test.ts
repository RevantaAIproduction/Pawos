import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrganizationMember, OrgRole } from '../../../../shared/organization/OrganizationTypes';
import {
  ContactPawosNote,
  MemberAvatar,
  MemberTable,
  OrganizationSummaryCard,
  OrganizationTabs,
  avatarHue,
  initialsOf,
  joinedLabel,
  removalQuestion,
  type OrganizationSummary,
} from './ManagedOrganizationViews';

/**
 * The Team and Enterprise organization dashboard: summary, tabs and member directory. Everything
 * shown comes from the records passed in; nothing here can add a member, buy a seat or check out.
 */
const member = (over: Partial<OrganizationMember>): OrganizationMember =>
  ({
    id: 'm1',
    organizationId: 'org',
    userId: 'u1',
    email: 'tharun@revantaai.com',
    displayName: 'Tharun Esta',
    role: 'owner',
    status: 'active',
    joinedAt: '2026-10-12T09:00:00Z',
    seatTier: 'standard',
    jobRoleRef: null,
    ...over,
  }) as OrganizationMember;

const MEMBERS: OrganizationMember[] = [
  member({}),
  member({ id: 'm2', userId: 'u2', email: 'pawos@revantaai.com', displayName: null, role: 'member', seatTier: 'premium', joinedAt: '2026-10-13T09:00:00Z' }),
  member({ id: 'm3', userId: null, email: 'new.person@revantaai.com', displayName: null, role: 'member', status: 'invited', joinedAt: null }),
  member({ id: 'm4', userId: 'u4', email: 'gone@revantaai.com', displayName: 'Gone Person', role: 'member', status: 'removed' }),
];
const TEAM_ROLES: OrgRole[] = ['owner', 'billingAdministrator', 'workspaceAdministrator', 'member'];
const ENTERPRISE_ROLES: OrgRole[] = ['organizationOwner', 'organizationAdministrator', 'itAdministrator', 'securityAdministrator', 'billingAdministrator', 'departmentManager', 'member'];

const summary = (over: Partial<OrganizationSummary> = {}): OrganizationSummary => ({
  name: 'PawOS Test Team',
  plan: 'Team',
  organizationId: 'pawos-test-team',
  domain: 'revantaai.com',
  ownerName: 'Tharun Esta',
  ownerEmail: 'tharun@revantaai.com',
  activeMembers: 2,
  pendingMembers: 1,
  seatCount: 5,
  ...over,
});
const renderSummary = (over: Partial<OrganizationSummary> = {}, canContact = true) =>
  renderToStaticMarkup(
    React.createElement(OrganizationSummaryCard, { summary: summary(over), logo: React.createElement('span', { 'data-testid': 'logo' }, 'PT'), canContact, onContact: () => {}, onCopyId: () => {}, copied: false })
  );
const renderTable = (over: Partial<React.ComponentProps<typeof MemberTable>> = {}) =>
  renderToStaticMarkup(
    React.createElement(MemberTable, { members: MEMBERS, showSeatType: true, canManage: true, roleOptions: TEAM_ROLES, ownerUserId: 'u1', onChangeRole: () => {}, onRemove: () => {}, ...over })
  );

describe('avatars', () => {
  it('initials come from the person’s name, or from their email when there is no name', () => {
    expect(initialsOf('Tharun Esta')).toBe('TE');
    expect(initialsOf('pawos@revantaai.com')).toBe('PA');
    expect(initialsOf('new.person@revantaai.com')).toBe('NP');
    expect(initialsOf('Madonna')).toBe('MA');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  it('each member has their own: the same person always the same colour, different people usually different', () => {
    expect(avatarHue('tharun@revantaai.com')).toBe(avatarHue('THARUN@revantaai.com'));
    expect(avatarHue('tharun@revantaai.com')).not.toBe(avatarHue('pawos@revantaai.com'));
    const html = renderTable();
    expect(html.match(/data-testid="member-avatar"/g)).toHaveLength(3);
    expect(html).toContain('>TE<');
    expect(html).toContain('>PA<');
    expect(html).toContain('>NP<');
  });

  it('a member’s avatar is never an image: no photo is invented and the organization logo is not reused', () => {
    expect(renderToStaticMarkup(React.createElement(MemberAvatar, { name: null, email: 'pawos@revantaai.com' }))).not.toContain('<img');
    expect(renderTable()).not.toContain('<img');
  });
});

describe.each([
  ['Team', 'Team', TEAM_ROLES, true],
  ['Enterprise', 'Enterprise', ENTERPRISE_ROLES, false],
] as const)('the %s organization', (_name, plan, roles, seatTypes) => {
  it('summary: name, plan badge, owner, domain, ID with a copy action, members and seats, and Contact PawOS', () => {
    const html = renderSummary({ plan });
    expect(html).toContain('PawOS Test Team');
    expect(html).toContain(`>${plan}<`);
    expect(html).toContain('Tharun Esta');
    expect(html).toContain('tharun@revantaai.com');
    expect(html).toContain('@revantaai.com');
    expect(html).toContain('pawos-test-team');
    expect(html).toContain('aria-label="Copy organization ID"');
    expect(html).toContain('2 of 5 seats in use');
    expect(html).toContain('1 pending');
    expect(html).toContain('data-testid="org-contact-pawos"');
    expect(html).toContain('data-testid="logo"');
  });

  it('member table: the columns the records support, and nobody who was removed', () => {
    const html = renderTable({ roleOptions: [...roles], showSeatType: seatTypes });
    for (const column of ['Member', 'Role', 'Status', 'Joined', 'Actions']) expect(html).toContain(`>${column}</th>`);
    expect(html.includes('>Seat</th>')).toBe(seatTypes);
    expect(html.match(/data-testid="org-member-row"/g)).toHaveLength(3);
    expect(html).not.toContain('gone@revantaai.com');
    expect(html).toContain('>Active<');
    expect(html).toContain('>Pending<');
    expect(html).toContain('12 Oct 2026');
    expect(html).toContain('aria-label="Search members"');
    expect(html).toContain('aria-label="Filter by role"');
  });

  it('has no way to invite, add, reassign or buy: no email field, no seat picker, no such button', () => {
    const html = renderSummary({ plan }) + renderTable({ roleOptions: [...roles], showSeatType: seatTypes }) + renderToStaticMarkup(React.createElement(ContactPawosNote, { canContact: true, onContact: () => {}, withButton: true }));
    // No field to type an address into, no seat picker, and no control with any of these labels.
    expect(html).not.toMatch(/type="email"|teammate@|\/mo\)|checkout/i);
    const controls = [...html.matchAll(/<(?:button|option)[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(controls.filter((text) => /invite|add member|reassign|request (up|down)grade|purchase|buy/i.test(text ?? ''))).toEqual([]);
    expect(html).not.toMatch(/Only @.* emails can be invited/);
    expect(html).toContain('Members and seats are managed by PawOS');
    expect(html).toContain('Contact PawOS');
  });

  it('never says a request was sent or is pending', () => {
    const html = renderSummary({ plan }) + renderToStaticMarkup(React.createElement(ContactPawosNote, { canContact: true, onContact: () => {}, withButton: true }));
    expect(html).not.toMatch(/request (was |has been )?(sent|submitted|received)|awaiting approval|upgrade (is )?(pending|complete)/i);
  });
});

describe('seat types', () => {
  it('Team shows each member’s seat; it is a label, not a control', () => {
    const html = renderTable();
    expect(html).toContain('>Standard<');
    expect(html).toContain('>Premium<');
    expect(html).toContain('Seats are allocated by PawOS');
  });

  it('Enterprise has no seat column', () => {
    const html = renderTable({ showSeatType: false, roleOptions: ENTERPRISE_ROLES });
    expect(html).not.toContain('>Standard<');
    expect(html).not.toContain('>Premium<');
  });
});

describe('who can do what', () => {
  it('a manager sees a role selector and Remove on every row except the owner’s', () => {
    const html = renderTable({ canManage: true });
    expect(html.match(/aria-label="Remove /g)).toHaveLength(2);
    expect(html.match(/aria-label="Role of /g)).toHaveLength(2);
    expect(html).not.toContain('aria-label="Remove tharun@revantaai.com"');
    expect(html).not.toContain('aria-label="Role of tharun@revantaai.com"');
    expect(html).toContain('aria-label="Remove pawos@revantaai.com"');
  });

  it('an ordinary member sees the directory only: no Remove, no role selector, no Actions column', () => {
    const html = renderTable({ canManage: false });
    expect(html).not.toContain('aria-label="Remove ');
    expect(html).not.toContain('aria-label="Role of ');
    expect(html).not.toContain('>Actions</th>');
    expect(html).toContain('pawos@revantaai.com');
  });

  it('the owner is marked as the owner', () => {
    expect(renderTable()).toMatch(/Tharun Esta<span[^>]*>Owner<\/span>/);
  });

  it('Contact PawOS is a button for owners and admins, and a pointer to them for everyone else', () => {
    expect(renderSummary({}, false)).not.toContain('data-testid="org-contact-pawos"');
    const forMember = renderToStaticMarkup(React.createElement(ContactPawosNote, { canContact: false, onContact: () => {}, withButton: true }));
    expect(forMember).not.toContain('<button');
    expect(forMember).toContain('Ask your organization’s owner or administrator.');
  });

  it('removal asks first, naming the person and the organization', () => {
    expect(removalQuestion({ displayName: 'Tharun Esta', email: 'tharun@revantaai.com' }, 'PawOS Test Team')).toBe(
      'Remove Tharun Esta (tharun@revantaai.com) from PawOS Test Team? They will lose access to this organization.'
    );
    expect(removalQuestion({ displayName: null, email: 'pawos@revantaai.com' }, 'Acme')).toBe('Remove pawos@revantaai.com from Acme? They will lose access to this organization.');
  });
});

describe('missing details never break the screen or get made up', () => {
  it('no owner, no domain, no seat count: those parts are left out', () => {
    const html = renderSummary({ ownerName: null, ownerEmail: null, domain: '', seatCount: null, pendingMembers: 0 });
    expect(html).not.toContain('data-testid="org-owner"');
    expect(html).not.toContain('data-testid="org-seats"');
    expect(html).toContain('2 active');
    expect(html).not.toMatch(/undefined|null|NaN|@ /);
  });

  it('an owner with an email but no name is shown by the email, once', () => {
    const html = renderSummary({ ownerName: null });
    expect(html.match(/tharun@revantaai\.com/g)).toHaveLength(1);
  });

  it('a member with no join date shows a dash; an unreadable date does too', () => {
    expect(joinedLabel(null)).toBe('—');
    expect(joinedLabel('not a date')).toBe('—');
    expect(joinedLabel('2026-10-12T09:00:00Z')).toBe('12 Oct 2026');
  });

  it('no members at all: a clear empty state, pointing to PawOS', () => {
    const html = renderTable({ members: [] });
    expect(html).toContain('data-testid="org-members-empty"');
    expect(html).toContain('No members yet. Contact PawOS to add your team.');
  });

  it('nothing private or invented appears: no phone, no costs, no made-up claims', () => {
    const html = renderSummary() + renderTable();
    expect(html).not.toMatch(/mobile|phone|allowance|provider|micro|SLA|SOC ?2|ISO ?27001|unlimited/i);
  });
});

describe('navigation', () => {
  it('tabs are real tabs: one selected, each a button', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrganizationTabs, { tabs: [{ id: 'overview', label: 'Overview' }, { id: 'members', label: 'Members' }], active: 'members', onSelect: () => {} })
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-selected="true"[^>]*>Members/);
    expect(html).toMatch(/aria-selected="false"[^>]*>Overview/);
  });

  const screen = fs.readFileSync(path.resolve(__dirname, 'OrganizationSection.tsx'), 'utf8');

  it('Team and Enterprise get the dashboard; every organization feature is still reachable from a tab', () => {
    expect(screen).toContain('if (managedByPawos) {');
    expect(screen).toContain('data-testid="org-managed-dashboard"');
    for (const tab of ['Overview', 'Members', 'Organization Details', 'Usage & Credits', 'Security', 'Roles & Permissions', 'Audit Log', 'Workspace & Tools']) {
      expect(screen, tab).toContain(`label: '${tab}'`);
    }
    const dashboard = screen.slice(screen.indexOf('if (managedByPawos) {'), screen.indexOf("<h3 className={styles.cardTitle}>General</h3>"));
    // Every section the old hub listed is rendered by some tab.
    for (const id of ['credits', 'sso', 'governance', 'credentialVault', 'temporaryPermissions', 'roles', 'jobRoles', 'auditLog', 'branding']) {
      expect(dashboard, id).toContain(`renderOrgSection('${id}')`);
    }
    for (const id of ['activity', 'tasks', 'remoteAssistance', 'workspace', 'crm']) expect(dashboard, id).toContain(`'${id}'`);
  });

  it('the dashboard contains no invite form, seat checkout or seat request', () => {
    const dashboard = screen.slice(screen.indexOf('if (managedByPawos) {'), screen.indexOf("<h3 className={styles.cardTitle}>General</h3>"));
    expect(dashboard).not.toMatch(/inviteMember|setInviteEmail|reassignPendingSeat|requestSeatChange|setSeatCheckoutIntent|NativeBillingCheckoutModal|doInviteMember/);
  });

  it('usage shown is the existing display for the plan: the Enterprise pool only for Enterprise', () => {
    expect(screen).toContain("{tier === 'enterprise' && <CreditPoolCard organizationId={org.id} orgMembers={members} />}");
  });

  it('removal goes through the role check, a confirmation, and reports the real outcome', () => {
    const start = screen.indexOf('const confirmAndRemove = async');
    const fn = screen.slice(start, screen.indexOf('const updateRole', start));
    expect(fn).toContain('if (!canManageMembers(myRole)) return;');
    expect(fn).toContain('window.confirm(removalQuestion(member, org.name))');
    expect(fn.indexOf('window.confirm')).toBeLessThan(fn.indexOf('await removeMember(member.id)'));
    expect(fn).toContain('was removed from');
    expect(fn).toContain('Could not remove');
  });

  it('an organization on another tier keeps the screen it had', () => {
    expect(screen).toContain("<h3 className={styles.cardTitle}>General</h3>");
    expect(screen).toContain('<SectionHub tiles={ORG_SECTION_TILES} onSelect={setSelectedSection} />');
    expect(screen).toContain('onClick={inviteMember}');
  });
});
