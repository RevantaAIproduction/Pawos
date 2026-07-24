/**
 * Phase 6 of the Team & Enterprise Collaboration Platform — Enterprise
 * hardening: the org-scoped infrastructure credential vault and the
 * generalized approval workflow. organization_policies, audit_log, and
 * has_capability() already exist from Phase 0 (see PermissionTypes.ts);
 * this file only adds the two genuinely new Phase 6 shapes.
 */

/** Matches InfraConnectorKind in src/main/infrastructure/InfrastructureConnectorRegistry.ts. */
export type OrgCredentialConnectorKind =
  | 'sourceControl'
  | 'projectManagement'
  | 'cicd'
  | 'hosting'
  | 'cloud'
  | 'container'
  | 'infrastructure';

/** Never carries the decrypted secret — that only ever exists transiently,
 * returned by readOrganizationCredential() and passed straight to a
 * connector's setToken(), never stored in component state longer than needed. */
export type OrgCredential = {
  id: string;
  organizationId: string;
  connectorKind: OrgCredentialConnectorKind;
  connectorId: string;
  label: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRequestStatus = 'pending' | 'approved' | 'denied';

export type ApprovalRequest = {
  id: string;
  organizationId: string;
  requestedBy: string;
  capability: string;
  actionType: string;
  summary: string;
  payload: Record<string, unknown>;
  status: ApprovalRequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

/** The well-known policy_key this phase introduces. organization_policies
 * itself is generic key/value (Phase 0) — this is a documentation aid for
 * the one shape Phase 6 code actually reads/writes. */
export const REQUIRE_APPROVAL_POLICY_KEY = 'require_approval';

export type RequireApprovalPolicyValue = {
  capabilities: string[];
};
