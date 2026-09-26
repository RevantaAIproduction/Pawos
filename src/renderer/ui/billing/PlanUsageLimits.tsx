import React from 'react';
import type { EntitlementSnapshot } from '../../../shared/billing/BillingTypes';
import { formatPlanName } from '../../billing/EntitlementDisplay';
import { getExhaustionPrimaryActions } from './CreditsRequiredNotice';

function formatPlanHeading(entitlement: EntitlementSnapshot): string {
  if (entitlement.tier === 'team') return `Team ${entitlement.seatTier === 'premium' ? 'Premium' : 'Standard'} (pooled)`;
  if (entitlement.tier === 'enterprise') return 'Enterprise (pooled)';
  return formatPlanName(entitlement).replace(/^Paw /, '');
}

function formatResetIn(resetsAt: number, now: number): string {
  const ms = Math.max(0, resetsAt - now);
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `resets in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 48) return `resets in ${hours} h ${totalMinutes % 60} min`;
  return `resets ${new Date(resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

function formatAmount(value: number, unit: 'PC' | 'h'): string {
  const rounded = unit === 'h' ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded.toLocaleString()}${unit === 'h' ? ' h' : ' PC'}`;
}

function LimitRow({ label, used, limit, unit, reset }: { label: string; used: number; limit: number; unit: 'PC' | 'h'; reset: string | null }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }} data-testid="plan-usage-limit">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 12 }}>
        <span>{label}</span>
        <span style={{ color: 'rgba(var(--pawos-overlay-rgb), 0.7)' }}>
          {formatAmount(used, unit)} / {formatAmount(limit, unit)} · {pct}%
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(var(--pawos-overlay-rgb), 0.1)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--pawos-danger, #d9534f)' : 'var(--pawos-fg)' }} />
      </div>
      {reset && <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.55)', marginTop: 3 }}>{reset}</div>}
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
  background: 'transparent',
  color: 'var(--pawos-fg)',
  fontSize: 11,
  cursor: 'pointer',
};

/** Upgrade / Buy buttons shown once included capacity is used up — the same tier rules as the notice. */
function LimitActions({ entitlement, onUpgrade, onBuyCompute }: { entitlement: EntitlementSnapshot; onUpgrade?: () => void; onBuyCompute?: () => void }) {
  const handlers: Record<string, (() => void) | undefined> = { upgrade: onUpgrade, buyCompute: onBuyCompute };
  const actions = getExhaustionPrimaryActions(entitlement.tier, entitlement.seatTier, entitlement.pooled, false, entitlement.proMaxVariant, entitlement.buildFinalWeek ?? false).filter((a) => handlers[a.id]);
  if (actions.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} data-testid="plan-usage-actions">
      {actions.map((a) => (
        <button key={a.id} type="button" style={actionButtonStyle} onClick={handlers[a.id]}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The plan's usage for the current effective tier. Paid tiers and PawOS Build see every rolling
 * limit (5-hour PC, weekly PC, 5-hour and weekly active hours) straight from the EntitlementSnapshot
 * the real gate uses. Paw Go sees only a status (working / limit reached) — no meters. Once included
 * capacity is used up, the tier's Upgrade / Buy Paw Compute actions appear (when handlers are given).
 * Pooled (Team/Enterprise) usage lives in the organization pool, so only the heading is shown.
 */
export function PlanUsageLimits({
  entitlement,
  now = Date.now(),
  onUpgrade,
  onBuyCompute,
}: {
  entitlement: EntitlementSnapshot | null | undefined;
  now?: number;
  onUpgrade?: () => void;
  onBuyCompute?: () => void;
}) {
  if (!entitlement) return <div style={{ fontSize: 11 }}>Loading usage…</div>;

  const heading = (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 8 }}>
      Plan usage · {formatPlanHeading(entitlement)}
    </div>
  );
  const limitReached = !entitlement.pooled && !entitlement.hasCreditsRemaining;

  if (entitlement.tier === 'go') {
    return (
      <div data-testid="plan-usage-go-status">
        {heading}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: limitReached ? 'var(--pawos-danger, #d9534f)' : '#4caf50' }} />
          {limitReached ? 'Limit reached — upgrade or buy Paw Compute to keep going.' : 'Working normally.'}
        </div>
        {limitReached && <LimitActions entitlement={entitlement} onUpgrade={onUpgrade} onBuyCompute={onBuyCompute} />}
      </div>
    );
  }

  // PawOS Build: a reset that would land at or after the grant's end never happens — access ends instead.
  const buildEndsAt = entitlement.tier === 'build' ? entitlement.buildAccess?.endsAt ?? null : null;
  const endsBefore = (resetsAt: number) => buildEndsAt !== null && resetsAt >= buildEndsAt;
  const accessEnds = buildEndsAt !== null ? `no reset · access ends ${new Date(buildEndsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '';
  const windowReset =
    entitlement.usageWindowResetsAt === null ? 'rolling 5-hour window'
    : endsBefore(entitlement.usageWindowResetsAt) ? accessEnds
    : formatResetIn(entitlement.usageWindowResetsAt, now);
  const weekReset = endsBefore(entitlement.usageWeekResetsAt) ? accessEnds : formatResetIn(entitlement.usageWeekResetsAt, now);
  const finalBuildWeek = endsBefore(entitlement.usageWeekResetsAt);

  return (
    <div>
      {heading}
      {entitlement.pooled ? (
        <div style={{ fontSize: 11, color: 'rgba(var(--pawos-overlay-rgb), 0.7)' }}>Usage is drawn from your organization's shared pool.</div>
      ) : (
        <>
          {limitReached && (
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }} data-testid="plan-usage-limit-reached">
              {entitlement.tier === 'build'
                ? finalBuildWeek
                  ? 'Limit reached — this is the last week of your PawOS Build access, so it will not reset again. Upgrade to Pro to keep going.'
                  : 'Limit reached — buy Paw Compute to keep going, or wait for it to reset automatically.'
                : 'Limit reached for now.'}
            </div>
          )}
          {entitlement.limit5hPc !== null && (
            <LimitRow label="5-hour window" used={entitlement.usage5hPc} limit={entitlement.limit5hPc} unit="PC" reset={windowReset} />
          )}
          {entitlement.limitWeeklyPc !== null && (
            <LimitRow label="This week" used={entitlement.usageWeeklyPc} limit={entitlement.limitWeeklyPc} unit="PC" reset={weekReset} />
          )}
          {entitlement.activeHours5h !== null && (
            <LimitRow label="Active time · 5-hour window" used={entitlement.activeHoursUsed5h} limit={entitlement.activeHours5h} unit="h" reset={windowReset} />
          )}
          {entitlement.activeHoursWeekly !== null && (
            <LimitRow label="Active time · this week" used={entitlement.activeHoursUsed7d} limit={entitlement.activeHoursWeekly} unit="h" reset={weekReset} />
          )}
          {limitReached && <LimitActions entitlement={entitlement} onUpgrade={onUpgrade} onBuyCompute={onBuyCompute} />}
        </>
      )}
    </div>
  );
}
