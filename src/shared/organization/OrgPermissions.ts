import type { OrgRole } from './OrganizationTypes';

const BILLING_ROLES: OrgRole[] = ['owner', 'billingAdministrator', 'organizationOwner', 'organizationAdministrator'];
const MEMBER_MANAGEMENT_ROLES: OrgRole[] = ['owner', 'organizationOwner', 'organizationAdministrator', 'workspaceAdministrator'];
const WORKSPACE_ROLES: OrgRole[] = ['owner', 'workspaceAdministrator', 'organizationOwner', 'organizationAdministrator', 'departmentManager'];
const ORG_OWNER_ROLES: OrgRole[] = ['owner', 'organizationOwner'];

/** Pure permission checks — used both for real UI gating and to keep the Team/Enterprise docs accurate. */
export function canManageBilling(role: OrgRole): boolean {
  return BILLING_ROLES.includes(role);
}

export function canManageMembers(role: OrgRole): boolean {
  return MEMBER_MANAGEMENT_ROLES.includes(role);
}

export function canManageWorkspaces(role: OrgRole): boolean {
  return WORKSPACE_ROLES.includes(role);
}

/** Only the org owner can modify or delete the organization record itself. */
export function canManageOrganization(role: OrgRole): boolean {
  return ORG_OWNER_ROLES.includes(role);
}
