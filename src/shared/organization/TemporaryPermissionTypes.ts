/**
 * Phase 2 — time-bound elevation of a single capability for a single
 * user. Expiration is enforced live: has_capability() compares
 * expires_at against now() on every check (same pattern as JWT expiry
 * elsewhere in this app) rather than a scheduled job deleting rows —
 * an expired grant is treated as gone on the very next permission check.
 */
export type OrganizationTemporaryPermission = {
  id: string;
  organizationId: string;
  userId: string;
  capability: string;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
};
