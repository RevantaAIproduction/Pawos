import type { EntitlementSnapshot, RuntimeEntitlementId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Paw Go',
  pro: 'Paw Pro',
  proMax: 'Paw Pro Max',
  team: 'Paw Team',
  enterprise: 'Paw Enterprise',
};

const RUNTIME_LABELS: Record<RuntimeEntitlementId, string> = {
  coding: 'Coding Runtime',
  office: 'Office Runtime',
  browser: 'Browser Runtime',
  communication: 'Communication Runtime',
  infrastructure: 'Infrastructure Runtime',
  companion: 'Companion Runtime',
  governance: 'Governance Runtime',
  sales: 'Sales Runtime',
  hr: 'HR Runtime',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatTierLabel(tier: SubscriptionTierId): string {
  return TIER_LABELS[tier];
}

export function formatRuntimeEntitlements(runtimeEntitlements: readonly RuntimeEntitlementId[]): string {
  if (runtimeEntitlements.length === 0) return 'No paid runtime selected';
  return runtimeEntitlements.map((id) => RUNTIME_LABELS[id]).join(', ');
}

export function formatPlanAndRuntimeSummary(entitlement: EntitlementSnapshot | null): string {
  if (!entitlement) return '...';
  const runtimes = formatRuntimeEntitlements(entitlement.runtimeEntitlements);
  return `${formatTierLabel(entitlement.tier)} · ${runtimes}`;
}

export function formatPawComputeSummary(entitlement: EntitlementSnapshot | null): string {
  if (!entitlement) return '...';
  if (entitlement.pooled) {
    return `Pooled organization allowance · Used: ${formatNumber(entitlement.creditsUsedThisPeriod)}`;
  }
  if (entitlement.creditLimit === null) {
    return `Used: ${formatNumber(entitlement.creditsUsedThisPeriod)} · Remaining: Unlimited`;
  }

  const allowance = entitlement.creditLimit + entitlement.bonusComputeThisPeriod;
  const remaining = Math.max(allowance - entitlement.creditsUsedThisPeriod, 0);
  const bonus = entitlement.bonusComputeThisPeriod > 0 ? ` · Paw Credits bonus: ${formatNumber(entitlement.bonusComputeThisPeriod)}` : '';
  return `Used: ${formatNumber(entitlement.creditsUsedThisPeriod)} · Remaining: ${formatNumber(remaining)} · Limit: ${formatNumber(entitlement.creditLimit)}${bonus}`;
}
