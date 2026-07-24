/**
 * Phase 0 of the Team & Enterprise Collaboration Platform — the
 * data-driven capability engine, organization policies, generic audit
 * log, and workspace container. Every later phase's permission checks
 * (work assignment, credits, git collaboration, remote control) are
 * expected to call hasCapability() rather than hardcoding a role check,
 * the same way OrgPermissions.ts's pure functions are hardcoded today.
 */

/** Phase 0's capability set — grows as later phases add runtime-specific
 * capabilities (e.g. `infra.deploy`, `runtime.coding.execute`). Kept as a
 * plain string type (not a union) since the table is the source of truth
 * and new capabilities are meant to be addable without a code change. */
export type CapabilityId = string;

export type RoleCapability = {
  id: string;
  organizationId: string;
  role: string;
  capability: CapabilityId;
  allowed: boolean;
};

export type OrganizationPolicy = {
  id: string;
  organizationId: string;
  policyKey: string;
  policyValue: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: 'created' | 'updated' | 'deleted';
  entityType: string;
  entityId: string | null;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  createdAt: string;
};

export type OrganizationWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationWorkspaceMember = {
  id: string;
  workspaceId: string;
  organizationId: string;
  userId: string;
  role: string;
  addedBy: string | null;
  createdAt: string;
};

/** The well-known Phase 0/1 capability ids — a documentation aid, not an
 * exhaustive enum. New capabilities can exist in the table without
 * appearing here. */
export const KNOWN_CAPABILITIES = [
  'members.manage',
  'billing.manage',
  'workspaces.manage',
  'organization.manage',
  'roles.manage',
  'policies.manage',
  'audit.view',
  'crm.manage',
  'projects.manage',
  'documents.manage',
  'research.manage',
  'credits.manage',
  'tasks.manage',
  'permissions.grant',
  'repositories.manage',
  'remote_assistance.provide',
] as const;
