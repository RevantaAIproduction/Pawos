import React, { useEffect, useMemo, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../../organization/AutonomousTaskBillingService';
import {
  AI_USAGE_CATEGORIES,
  AI_USAGE_CATEGORY_COLORS,
  AI_USAGE_CATEGORY_DESCRIPTIONS,
  AI_USAGE_CATEGORY_LABELS,
  type AiUsageCategory,
} from '../../../../shared/billing/AiUsageCategories';
import type { CreditBalance, CreditConsumptionRecord, SubscriptionTierId } from '../../../../shared/billing/BillingTypes';
import type { TicketBalance } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import { useEntitlementSnapshot } from '../../../billing/useEntitlementSnapshot';
import { PlanUsageLimits } from '../../billing/PlanUsageLimits';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** A record written before category tracking existed has no `category` — treated as 'chat' here
 *  rather than invented as something more specific. See CreditConsumptionRecord's own comment. */
function recordCategory(record: CreditConsumptionRecord): AiUsageCategory {
  return record.category ?? 'chat';
}

type CategoryAggregate = { category: AiUsageCategory; count: number; percent: number };

function aggregateByCategory(history: CreditConsumptionRecord[]): CategoryAggregate[] {
  const counts = new Map<AiUsageCategory, number>();
  for (const record of history) {
    const category = recordCategory(record);
    counts.set(category, (counts.get(category) ?? 0) + record.amount);
  }
  const total = history.reduce((sum, r) => sum + r.amount, 0);
  return AI_USAGE_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0).map((category) => {
    const count = counts.get(category) ?? 0;
    return { category, count, percent: total > 0 ? (count / total) * 100 : 0 };
  });
}

/** Real generated summaries — every sentence here is computed from the actual aggregate/history
 *  data passed in, never a templated placeholder shown regardless of the numbers. */
function buildInsights(aggregates: CategoryAggregate[], history: CreditConsumptionRecord[]): string[] {
  const insights: string[] = [];
  if (aggregates.length === 0) return insights;

  const top = [...aggregates].sort((a, b) => b.count - a.count)[0];
  if (top && top.percent >= 1) {
    insights.push(`${AI_USAGE_CATEGORY_LABELS[top.category]} used the most Paw Compute this period (${top.percent.toFixed(0)}%).`);
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = history.filter((r) => now - r.at < weekMs);
  const lastWeek = history.filter((r) => now - r.at >= weekMs && now - r.at < weekMs * 2);
  if (thisWeek.length > 0 && lastWeek.length > 0) {
    const thisWeekTotal = thisWeek.reduce((s, r) => s + r.amount, 0);
    const lastWeekTotal = lastWeek.reduce((s, r) => s + r.amount, 0);
    if (thisWeekTotal > lastWeekTotal * 1.15) {
      insights.push('Your Paw Compute use increased compared to last week.');
    } else if (thisWeekTotal < lastWeekTotal * 0.85) {
      insights.push('Your Paw Compute use decreased compared to last week.');
    }
  }

  if (history.length >= 5) {
    const hourCounts = new Array(24).fill(0);
    for (const r of history) hourCounts[new Date(r.at).getHours()] += r.amount;
    let peakHour = 0;
    for (let h = 1; h < 24; h++) if (hourCounts[h] > hourCounts[peakHour]) peakHour = h;
    if (hourCounts[peakHour] > 0) {
      const rangeEnd = (peakHour + 2) % 24;
      const fmt = (h: number) => {
        const period = h < 12 ? 'AM' : 'PM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12} ${period}`;
      };
      insights.push(`Most AI activity happens around ${fmt(peakHour)}–${fmt(rangeEnd)}.`);
    }
  }

  const smallest = aggregates.length > 1 ? [...aggregates].sort((a, b) => a.percent - b.percent)[0] : null;
  if (smallest && smallest.percent > 0 && smallest.percent <= 8) {
    insights.push(`${AI_USAGE_CATEGORY_LABELS[smallest.category]} used only ${smallest.percent.toFixed(0)}% of your Paw Compute.`);
  }

  return insights;
}

/** Paw Compute amounts are fractional (cost-based): one decimal under 10 PC, whole PC above. */
function formatPc(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded.toLocaleString()} PC`;
}

function activityLabel(record: CreditConsumptionRecord): string {
  const category = recordCategory(record);
  return AI_USAGE_CATEGORY_LABELS[category];
}

/** SVG path for one pie wedge from `startAngle` to `endAngle` (radians, 0 = 12 o'clock, clockwise). */
function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.sin(startAngle);
  const y1 = cy - r * Math.cos(startAngle);
  const x2 = cx + r * Math.sin(endAngle);
  const y2 = cy - r * Math.cos(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/** Interactive pie chart — one filled wedge per category, sized by its real share of Paw Compute.
 *  Hovering a wedge or its legend row pulls the wedge out and shows what the category means. A
 *  single category is drawn as a full pie (not an empty ring). */
export function UsagePieChart({ aggregates, total }: { aggregates: CategoryAggregate[]; total: number }) {
  const [hovered, setHovered] = useState<AiUsageCategory | null>(null);
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const sorted = [...aggregates].sort((a, b) => b.count - a.count);

  let angle = 0;
  const wedges = sorted.map((agg) => {
    const sweep = (agg.percent / 100) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const mid = start + sweep / 2;
    return { ...agg, start, end: angle, mid };
  });

  const active = hovered ? sorted.find((a) => a.category === hovered) : null;
  const single = wedges.length === 1;

  return (
    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, overflow: 'visible' }} role="img" aria-label="Paw Compute by category">
        {wedges.map((w) => {
          const isHovered = hovered === w.category;
          const pull = isHovered && !single ? 6 : 0;
          const dx = pull * Math.sin(w.mid);
          const dy = -pull * Math.cos(w.mid);
          const common = {
            fill: AI_USAGE_CATEGORY_COLORS[w.category],
            stroke: '#141418',
            strokeWidth: single ? 0 : 2,
            style: { cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.15s ease', opacity: hovered && !isHovered ? 0.5 : 1, transform: `translate(${dx}px, ${dy}px)` },
            onMouseEnter: () => setHovered(w.category),
            onMouseLeave: () => setHovered(null),
          };
          return single
            ? <circle key={w.category} cx={cx} cy={cy} r={radius} {...common} />
            : <path key={w.category} d={wedgePath(cx, cy, radius, w.start, w.end)} {...common} />;
        })}
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 4 }}>
          Total: <strong style={{ color: 'inherit' }}>{formatPc(total)}</strong>
        </div>
        {wedges.map((w) => (
          <div
            key={w.category}
            onMouseEnter={() => setHovered(w.category)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              background: hovered === w.category ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: AI_USAGE_CATEGORY_COLORS[w.category], flexShrink: 0 }} />
            <span style={{ fontSize: 13, flex: 1 }}>{AI_USAGE_CATEGORY_LABELS[w.category]}</span>
            <span style={{ fontSize: 12.5, color: '#96969e' }}>{formatPc(w.count)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, width: 42, textAlign: 'right' }}>{w.percent.toFixed(0)}%</span>
          </div>
        ))}
        <p className={styles.cardBody} style={{ marginTop: 6, fontSize: 11.5, minHeight: 16 }}>
          {active ? AI_USAGE_CATEGORY_DESCRIPTIONS[active.category] : 'Hover a slice to see what it includes.'}
        </p>
      </div>
    </div>
  );
}

/**
 * AI Usage Dashboard — replaces the old three empty Development/Productivity/AI Usage
 * ChartContainer placeholders with a single view built entirely from real, already-recorded data:
 * CreditStore's consumption history (see billingGetCreditHistory) categorized by the real Task
 * Card actions each turn ran (see AiUsageCategories.ts). No usage numbers here are invented —
 * a fresh account with no history renders the Empty State, not a fabricated chart.
 */
export function AnalyticsSection({ user }: { user: AuthUser }) {
  const entitlement = useEntitlementSnapshot();
  const [tier, setTier] = useState<SubscriptionTierId | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [history, setHistory] = useState<CreditConsumptionRecord[]>([]);
  const [ticketBalance, setTicketBalance] = useState<TicketBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [bucketFunded, setBucketFunded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user.isGuest) {
      setLoading(false);
      return;
    }
    Promise.all([
      ipc.billingGetSubscription(),
      ipc.billingGetCreditBalance(),
      ipc.billingGetCreditHistory(),
    ])
      .then(async ([subscription, creditBalance, creditHistory]) => {
        setTier(subscription.tier);
        setBalance(creditBalance);
        // Bucket-funded usage is accounted on the server in customer PC; show that history.
        const usageSummary = await ipc.billingGetUsageSummary().catch(() => null);
        setBucketFunded(usageSummary?.bucketFunded === true);
        if (usageSummary?.bucketFunded) {
          const serverHistory = await ipc.billingGetUsageHistory(200).catch(() => []);
          setHistory(serverHistory.map((entry) => ({
            amount: entry.pc,
            reason: entry.category,
            at: Date.parse(entry.at),
            category: (AI_USAGE_CATEGORIES as string[]).includes(entry.category) ? (entry.category as AiUsageCategory) : 'chat',
          })));
        } else {
          setHistory(creditHistory);
        }
        if (subscription.tier === 'proMax') {
          autonomousTaskBillingService.getTicketBalance(null).then(setTicketBalance).catch(() => {});
        }
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [user.isGuest]);

  const aggregates = useMemo(() => aggregateByCategory(history), [history]);
  const insights = useMemo(() => buildInsights(aggregates, history), [aggregates, history]);
  const recentActivity = useMemo(() => [...history].sort((a, b) => b.at - a.at).slice(0, 20), [history]);
  const totalUsage = history.reduce((s, r) => s + r.amount, 0);

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>AI Usage</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Sign in to see your AI Usage and AI Credits.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>AI Usage</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>AI Usage</h3>
        <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 6 }}>{error}</p>
      </div>
    );
  }

  // Usage is metered in Paw Compute (PC) against rolling 5-hour / weekly windows — there is no
  // monthly cap (CreditBalance.limit is null for every tier), so show the real plan limits instead.
  const planBucket = entitlement?.usageSummary?.buckets.find((b) => b.type === 'monthly_plan' && b.status !== 'expired' && b.status !== 'revoked');
  const usedThisPeriod = bucketFunded ? planBucket?.pcUsed ?? 0 : balance?.usedThisPeriod ?? 0;
  const isTeamOrEnterprise = tier === 'team' || tier === 'enterprise';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* 1. Usage Overview */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Usage Overview</h3>
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Paw Compute used · current 30-day period</p>
          <p style={{ fontSize: 20, fontWeight: 700 }}>{formatPc(usedThisPeriod)}</p>
        </div>
        <PlanUsageLimits entitlement={entitlement} />
      </div>

      {history.length === 0 ? (
        /* 7. Empty State */
        <div className={styles.card} style={{ textAlign: 'center', padding: '40px 24px' }}>
          <h3 className={styles.cardTitle}>No AI activity yet</h3>
          <p className={styles.cardBody} style={{ marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            Once you start using PawOS, your Paw Compute breakdown, recent activity, and insights will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* 2. AI Usage Breakdown */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Paw Compute by activity</h3>
            <div style={{ marginTop: 10 }}>
              <UsagePieChart aggregates={aggregates} total={totalUsage} />
            </div>
          </div>

          {/* 3. Recent AI Activity */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Recent AI Activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
              {recentActivity.map((record, i) => {
                const category = recordCategory(record);
                const d = new Date(record.at);
                return (
                  <div key={`${record.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: AI_USAGE_CATEGORY_COLORS[category], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#96969e', width: 78, flexShrink: 0 }}>
                      {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 12.5, flex: 1 }}>{activityLabel(record)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. AI Insights */}
          {insights.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>AI Insights</h3>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                {insights.map((insight) => (
                  <li key={insight} className={styles.cardBody} style={{ marginBottom: 4 }}>{insight}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 5. Credits */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Credits</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
          PawOS tracks two separate balances: your plan&apos;s Paw Compute (above, limited by rolling 5-hour and
          weekly windows), and — for Pro Max and above — a separate dollar-denominated Ticket Balance used only
          for the Autonomous Ticket System.
        </p>
        {tier === 'proMax' ? (
          ticketBalance ? (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Ticket balance</p>
                <p style={{ fontSize: 18, fontWeight: 600 }}>${ticketBalance.balanceUsd.toFixed(2)}</p>
              </div>
              <div>
                <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Tickets completed</p>
                <p style={{ fontSize: 18, fontWeight: 600 }}>{ticketBalance.ticketsUsedCount}</p>
              </div>
            </div>
          ) : (
            <p className={styles.cardBody}>No Ticket Balance activity yet — see Settings → Billing to add funds.</p>
          )
        ) : isTeamOrEnterprise ? (
          <p className={styles.cardBody}>
            Your organization manages one shared Ticket Balance for every member — see{' '}
            <strong>Organization → Credits &amp; Billing</strong> for the current balance and usage history.
          </p>
        ) : (
          <p className={styles.cardBody}>Available on Pro Max and above.</p>
        )}
      </div>

      {/* 6. Team Analytics — Team/Enterprise only, honestly scoped to what's actually tracked */}
      {isTeamOrEnterprise && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Team Analytics</h3>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            Per-member AI Usage attribution isn&apos;t tracked yet — usage above is this device&apos;s own local
            history, not aggregated across your organization. Your organization&apos;s shared Ticket Balance and
            completed-ticket history are available under <strong>Organization → Credits &amp; Billing</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
