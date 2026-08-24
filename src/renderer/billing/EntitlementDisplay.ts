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

/** Rolling-window Paw Compute usage summary — shows real 5-hour and 7-day usage/limit from the
 *  authoritative rolling-window counters (usage5hPc / limit5hPc / usage7dPc / limit7dPc on the
 *  EntitlementSnapshot). Never reads the deprecated creditLimit / weeklyCreditLimit fields, which
 *  are always null since Phase 2 replaced flat monthly limits with rolling windows. Pooled
 *  (Enterprise) has no personal rolling-window limit locally; it retains a plain used-count label. */
export function formatPawComputeSummary(entitlement: EntitlementSnapshot | null): string {
  if (!entitlement) return '...';
  if (entitlement.pooled) {
    return `Pooled organization allowance · ${formatNumber(entitlement.creditsUsedThisPeriod)} used`;
  }

  const { usage5hPc, limit5hPc, usage7dPc, limit7dPc } = entitlement;

  const fmt5h = limit5hPc !== null
    ? `5h: ${formatNumber(usage5hPc)} / ${formatNumber(limit5hPc)} PC`
    : `5h: ${formatNumber(usage5hPc)} PC`;
  const fmt7d = limit7dPc !== null
    ? `Week: ${formatNumber(usage7dPc)} / ${formatNumber(limit7dPc)} PC`
    : `Week: ${formatNumber(usage7dPc)} PC`;

  return `${fmt5h} · ${fmt7d}`;
}

/** Compact percentage summary shown on hover — "Daily: 42% · Weekly: 17%".
 *  Returns null for pooled (Enterprise) accounts that have no rolling-window limit. */
export function formatPawComputePercent(entitlement: EntitlementSnapshot | null): string | null {
  if (!entitlement) return null;
  if (entitlement.pooled) return null;

  const { usage5hPc, limit5hPc, usage7dPc, limit7dPc } = entitlement;
  if (limit5hPc === null && limit7dPc === null) return null;

  const pct = (used: number, limit: number | null) =>
    limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const daily = pct(usage5hPc, limit5hPc);
  const weekly = pct(usage7dPc, limit7dPc);
  return `Daily: ${daily}% · Weekly: ${weekly}%`;
}
