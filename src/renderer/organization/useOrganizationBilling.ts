import { useEffect, useState } from 'react';
import { authService } from '../auth/AuthenticationProvider';
import { organizationService } from './OrganizationService';
import { canManageBilling } from '../../shared/organization/OrgPermissions';
import type { OrganizationMember, OrganizationRecord, OrgRole } from '../../shared/organization/OrganizationTypes';
import type { SeatTier } from '../../shared/billing/BillingTypes';
import type { AuthUser } from '../auth/AuthTypes';

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  billingAdministrator: 'Billing administrator',
  workspaceAdministrator: 'Workspace administrator',
  organizationOwner: 'Organization owner',
  organizationAdministrator: 'Organization administrator',
  itAdministrator: 'IT administrator',
  securityAdministrator: 'Security administrator',
  departmentManager: 'Department manager',
  member: 'Member',
};

export type OrganizationBilling = {
  organization: OrganizationRecord;
  userId: string;
  role: OrgRole;
  roleLabel: string;
  /** Owners and billing admins buy plans, seats and credits; everyone else only sees their plan and usage. */
  isAdmin: boolean;
  seatTier: SeatTier | null;
  /** Who a member can ask for more usage. */
  billingAdmins: { email: string; displayName: string | null }[];
};

/** For a Team / Enterprise account: the organization and this person's billing role. null otherwise. */
export function resolveOrganizationBilling(
  user: Pick<AuthUser, 'id' | 'email'>,
  organization: OrganizationRecord,
  members: OrganizationMember[]
): OrganizationBilling {
  const email = user.email?.toLowerCase();
  const mine = members.find((m) => m.userId === user.id || (email && m.email.toLowerCase() === email));
  const ownerRole: OrgRole = organization.tier === 'enterprise' ? 'organizationOwner' : 'owner';
  const role: OrgRole = mine?.role ?? (organization.ownerUserId === user.id ? ownerRole : 'member');
  return {
    organization,
    userId: user.id,
    role,
    roleLabel: ORG_ROLE_LABELS[role] ?? 'Member',
    isAdmin: canManageBilling(role),
    seatTier: mine?.seatTier ?? null,
    billingAdmins: members
      .filter((m) => m.status === 'active' && canManageBilling(m.role))
      .map((m) => ({ email: m.email, displayName: m.displayName })),
  };
}

export function useOrganizationBilling(user: AuthUser | null): { loading: boolean; billing: OrganizationBilling | null } {
  const [state, setState] = useState<{ loading: boolean; billing: OrganizationBilling | null }>({ loading: true, billing: null });
  const userId = user?.id;
  const userEmail = user?.email;
  const isGuest = user?.isGuest ?? true;

  useEffect(() => {
    let cancelled = false;
    if (!userId || isGuest) {
      setState({ loading: false, billing: null });
      return;
    }
    (async () => {
      try {
        const orgs = await organizationService.getMyOrganizations();
        const organization = orgs.find((o) => o.tier === 'enterprise') ?? orgs.find((o) => o.tier === 'team');
        if (!organization) {
          if (!cancelled) setState({ loading: false, billing: null });
          return;
        }
        const members = await organizationService.getMembers(organization.id);
        if (!cancelled) setState({ loading: false, billing: resolveOrganizationBilling({ id: userId, email: userEmail }, organization, members) });
      } catch {
        // Couldn't load the organization: show the individual view (purchases stay server-checked).
        if (!cancelled) setState({ loading: false, billing: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, userEmail, isGuest]);

  return state;
}

/** The same, for screens that don't have the signed-in user at hand (the chat window). */
export function useCurrentUserOrganizationBilling(): OrganizationBilling | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    authService
      .getCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return useOrganizationBilling(user).billing;
}
