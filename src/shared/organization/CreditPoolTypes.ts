/**
 * Phase 1 — organization credit pools. Additive only: an Individual/Guest
 * account has no organizationId and keeps using the existing local
 * CreditStore (src/main/billing/CreditStore.ts) completely untouched, the
 * same non-destructive precedent SubscriptionStore.syncFromOrganization
 * already set for tiers.
 */

export type OrganizationCreditPool = {
  id: string;
  organizationId: string;
  totalCredits: number;
  periodResetsAt: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreditAllocationType = 'member' | 'department';

export type OrganizationCreditAllocation = {
  id: string;
  organizationId: string;
  allocationType: CreditAllocationType;
  targetUserId: string | null;
  departmentName: string | null;
  allocatedCredits: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationCreditUsageEvent = {
  id: string;
  organizationId: string;
  userId: string;
  amount: number;
  reason: string | null;
  createdAt: string;
};

export type OrganizationCreditSummary = {
  pool: OrganizationCreditPool | null;
  allocations: OrganizationCreditAllocation[];
  usedThisPeriod: number;
  remaining: number | null;
};
