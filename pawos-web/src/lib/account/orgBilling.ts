import type { AccountContext, AccountOrganization } from "./accountContext";

/**
 * Team and Enterprise: who handles purchases. Admins (the roles that manage billing) buy plans,
 * seats and credits for the organization; members see their plan and usage but can't buy — their
 * admin does. Same roles as PawOS Desktop (src/shared/organization/OrgPermissions.ts, BILLING_ROLES).
 */
export const BILLING_ROLES = ["owner", "billingAdministrator", "organizationOwner", "organizationAdministrator"];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  billingAdministrator: "Billing administrator",
  workspaceAdministrator: "Workspace administrator",
  organizationOwner: "Organization owner",
  organizationAdministrator: "Organization administrator",
  itAdministrator: "IT administrator",
  securityAdministrator: "Security administrator",
  departmentManager: "Department manager",
  member: "Member",
};

export type OrgBilling = { organization: AccountOrganization; isAdmin: boolean; roleLabel: string } | null;

/** The organization behind a Team / Enterprise plan, and whether this person manages its billing. */
export function orgBilling(account: Pick<AccountContext, "tier" | "organizations">): OrgBilling {
  if (account.tier !== "team" && account.tier !== "enterprise") return null;
  const organization = account.organizations.find((org) => org.tier === account.tier) ?? account.organizations[0];
  if (!organization) return null;
  return { organization, isAdmin: BILLING_ROLES.includes(organization.role), roleLabel: ROLE_LABELS[organization.role] ?? "Member" };
}
