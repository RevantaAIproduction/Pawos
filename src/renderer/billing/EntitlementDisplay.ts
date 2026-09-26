import type { EffectiveTierId, EntitlementSnapshot, RuntimeEntitlementId } from '../../shared/billing/BillingTypes';
import { BUILD_EXPIRY_WARNING_DAYS } from '../../shared/billing/BillingTypes';

const TIER_LABELS: Record<EffectiveTierId, string> = {
  build: 'PawOS Build',
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

export function formatTierLabel(tier: EffectiveTierId): string {
  return TIER_LABELS[tier];
}

/**
 * The exact plan the account is on — "Paw Pro · Monthly", "Paw Pro · Yearly", "Paw Pro Max 5x",
 * "Paw Pro Max 20x" — so every screen names the same plan the customer actually bought.
 */
export function formatPlanName(plan: { tier: EffectiveTierId; proMaxVariant?: '5x' | '20x'; proBillingFrequency?: 'monthly' | 'yearly' }): string {
  if (plan.tier === 'proMax') return `${TIER_LABELS.proMax} ${plan.proMaxVariant === '20x' ? '20x' : '5x'}`;
  if (plan.tier === 'pro') return `${TIER_LABELS.pro} · ${plan.proBillingFrequency === 'yearly' ? 'Yearly' : 'Monthly'}`;
  return TIER_LABELS[plan.tier];
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
 *  authoritative rolling-window counters (usage5hPc / limit5hPc / usageWeeklyPc / limitWeeklyPc on the
 *  EntitlementSnapshot). Never reads the deprecated creditLimit / weeklyCreditLimit fields, which
 *  are always null since Phase 2 replaced flat monthly limits with rolling windows. Pooled
 *  (Enterprise) has no personal rolling-window limit locally; it retains a plain used-count label. */
export function formatPawComputeSummary(entitlement: EntitlementSnapshot | null): string {
  if (!entitlement) return '...';
  if (entitlement.pooled) {
    return `Pooled organization allowance · ${formatNumber(entitlement.creditsUsedThisPeriod)} used`;
  }
  // Paw Go shows a status only — never usage numbers.
  if (entitlement.tier === 'go') {
    return entitlement.hasCreditsRemaining ? 'Working normally' : 'Limit reached — upgrade or buy Paw Compute';
  }

  const { usage5hPc, limit5hPc, usageWeeklyPc, limitWeeklyPc } = entitlement;

  const fmt5h = limit5hPc !== null
    ? `5h: ${formatNumber(usage5hPc)} / ${formatNumber(limit5hPc)} PC`
    : `5h: ${formatNumber(usage5hPc)} PC`;
  const fmt7d = limitWeeklyPc !== null
    ? `Week: ${formatNumber(usageWeeklyPc)} / ${formatNumber(limitWeeklyPc)} PC`
    : `Week: ${formatNumber(usageWeeklyPc)} PC`;

  return `${fmt5h} · ${fmt7d}`;
}

/** Compact percentage summary shown on hover — "Daily: 42% · Weekly: 17%".
 *  Returns null for pooled (Enterprise) accounts that have no rolling-window limit. */
export function formatPawComputePercent(entitlement: EntitlementSnapshot | null): string | null {
  if (!entitlement) return null;
  if (entitlement.pooled) return null;
  if (entitlement.tier === 'go') return null; // status only for Go — no percentages

  const { usage5hPc, limit5hPc, usageWeeklyPc, limitWeeklyPc } = entitlement;
  if (limit5hPc === null && limitWeeklyPc === null) return null;

  const pct = (used: number, limit: number | null) =>
    limit !== null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const daily = pct(usage5hPc, limit5hPc);
  const weekly = pct(usageWeeklyPc, limitWeeklyPc);
  return `Daily: ${daily}% · Weekly: ${weekly}%`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type BuildAccessDisplay =
  | { kind: 'none' }
  | { kind: 'active'; endsAt: number; startsAt: number; daysLeft: number; expiringSoon: boolean }
  | { kind: 'expired'; endsAt: number }
  | { kind: 'revoked'; revokedAt: number | null };

/**
 * How the signed-in account's PawOS Build access should be presented. "active" is decided by the
 * effective tier the main process resolved (snapshot.tier === 'build'), never re-derived from dates
 * here, so the UI can never show Build as active while enforcement has already fallen back.
 */
export function describeBuildAccess(entitlement: EntitlementSnapshot | null, now = Date.now()): BuildAccessDisplay {
  const access = entitlement?.buildAccess;
  if (!entitlement || !access || access.status === 'none') return { kind: 'none' };
  if (access.status === 'revoked') return { kind: 'revoked', revokedAt: access.revokedAt };
  if (entitlement.tier === 'build' && access.startsAt !== null && access.endsAt !== null) {
    const daysLeft = Math.max(0, Math.ceil((access.endsAt - now) / DAY_MS));
    return { kind: 'active', startsAt: access.startsAt, endsAt: access.endsAt, daysLeft, expiringSoon: daysLeft <= BUILD_EXPIRY_WARNING_DAYS };
  }
  return access.endsAt !== null ? { kind: 'expired', endsAt: access.endsAt } : { kind: 'none' };
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
