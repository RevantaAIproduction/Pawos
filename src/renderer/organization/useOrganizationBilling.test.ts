import { describe, expect, it, vi } from 'vitest';
vi.mock('./OrganizationService', () => ({ organizationService: {} }));
import { resolveOrganizationBilling } from './useOrganizationBilling';
import type { OrganizationMember, OrganizationRecord } from '../../shared/organization/OrganizationTypes';

const org = (tier: 'team' | 'enterprise'): OrganizationRecord => ({ id: 'o1', slug: 'ORG-1', name: 'Acme', tier, ownerUserId: 'owner-id', createdAt: '', domain: 'acme.com' });
const member = (over: Partial<OrganizationMember>): OrganizationMember => ({
  id: Math.random().toString(),
  organizationId: 'o1',
  userId: null,
  email: 'x@acme.com',
  displayName: null,
  role: 'member',
  status: 'active',
  invitedAt: '',
  joinedAt: null,
  seatTier: null,
  jobRoleRef: null,
  ...over,
});

describe('Team / Enterprise billing role', () => {
  const members = [
    member({ userId: 'owner-id', email: 'boss@acme.com', role: 'owner' }),
    member({ userId: 'billing-id', email: 'money@acme.com', role: 'billingAdministrator' }),
    member({ userId: 'dev-id', email: 'dev@acme.com', role: 'member', seatTier: 'premium' }),
    member({ userId: 'ws-id', email: 'ws@acme.com', role: 'workspaceAdministrator' }),
  ];

  it('a member sees their plan and seat, cannot buy, and knows who to ask', () => {
    const b = resolveOrganizationBilling({ id: 'dev-id', email: 'dev@acme.com' }, org('team'), members);
    expect(b.isAdmin).toBe(false);
    expect(b.seatTier).toBe('premium');
    expect(b.billingAdmins.map((a) => a.email)).toEqual(['boss@acme.com', 'money@acme.com']);
  });

  it('owners and billing admins can buy', () => {
    expect(resolveOrganizationBilling({ id: 'owner-id', email: 'boss@acme.com' }, org('team'), members).isAdmin).toBe(true);
    expect(resolveOrganizationBilling({ id: 'billing-id', email: 'money@acme.com' }, org('team'), members).isAdmin).toBe(true);
  });

  it('a workspace admin manages people, not purchases', () => {
    expect(resolveOrganizationBilling({ id: 'ws-id', email: 'ws@acme.com' }, org('team'), members).isAdmin).toBe(false);
  });

  it('the organization creator without a member row is its owner', () => {
    const b = resolveOrganizationBilling({ id: 'owner-id', email: 'boss@acme.com' }, org('enterprise'), []);
    expect(b.role).toBe('organizationOwner');
    expect(b.isAdmin).toBe(true);
  });
});
