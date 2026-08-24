import type { SeatTier } from '../billing/BillingTypes';

/**
 * Real Team/Enterprise organization data model. These are CUSTOMER
 * organization roles — completely separate from PawOS's own internal
 * platform administrators (see src/shared/admin/AdminTypes.ts, Phase 3).
 * Backed by Supabase (not local JSON) because an organization is inherently
 * multi-person: a teammate's own device must be able to see an org someone
 * else created, which a local-only store cannot provide.
 */
export type OrgTier = 'team' | 'enterprise';

export type TeamRole = 'owner' | 'billingAdministrator' | 'workspaceAdministrator' | 'member';

export type EnterpriseRole =
  | 'organizationOwner'
  | 'organizationAdministrator'
  | 'itAdministrator'
  | 'securityAdministrator'
  | 'billingAdministrator'
  | 'departmentManager'
  | 'member';

export type OrgRole = TeamRole | EnterpriseRole;

export type OrgMemberStatus = 'invited' | 'active' | 'removed';

export type OrganizationRecord = {
  id: string;
  /** Human-readable identifier, e.g. "ORG-RVT-001" — generated at creation time. */
  slug: string;
  name: string;
  tier: OrgTier;
  ownerUserId: string;
  createdAt: string;
  /** The email domain (e.g. "acme.com") this organization is scoped to — derived from the creator's email at creation time. Every member's email must be on this domain, enforced both client-side and by a DB trigger. */
  domain: string;
  /**
   * Number of purchased seats for this organization. Null means no limit has been
   * configured yet (pre-seat-billing orgs). When set, syncFromOrganization enforces
   * this limit: active members > seat_count → org tier denied for the over-limit user.
   * Incremented by the "Add member seat" checkout flow.
   */
  seatCount?: number | null;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  /** Null until the invited person actually signs in with a matching email and the row is linked to their account. */
  userId: string | null;
  email: string;
  displayName: string | null;
  role: OrgRole;
  status: OrgMemberStatus;
  invitedAt: string;
  joinedAt: string | null;
  /** Only meaningful in a 'team' organization (Standard/Premium). Always null for 'enterprise' members — Enterprise seats are uniform. */
  seatTier: SeatTier | null;
  /** Organization Role (job title, e.g. "Frontend Engineer") — a third
   * attribute completely independent of seatTier (billing) and role
   * (permissions). Resolves via resolveOrgJobRole() in OrgJobRoles.ts.
   * Null means no job title has been assigned yet. */
  jobRoleRef: string | null;
};
