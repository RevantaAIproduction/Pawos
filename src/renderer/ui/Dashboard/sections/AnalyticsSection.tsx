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
    insights.push(`${AI_USAGE_CATEGORY_LABELS[top.category]} consumed the most AI Usage this period (${top.percent.toFixed(0)}%).`);
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = history.filter((r) => now - r.at < weekMs);
  const lastWeek = history.filter((r) => now - r.at >= weekMs && now - r.at < weekMs * 2);
  if (thisWeek.length > 0 && lastWeek.length > 0) {
    const thisWeekTotal = thisWeek.reduce((s, r) => s + r.amount, 0);
    const lastWeekTotal = lastWeek.reduce((s, r) => s + r.amount, 0);
    if (thisWeekTotal > lastWeekTotal * 1.15) {
      insights.push('AI Usage increased compared to last week.');
    } else if (thisWeekTotal < lastWeekTotal * 0.85) {
      insights.push('AI Usage decreased compared to last week.');
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
    insights.push(`${AI_USAGE_CATEGORY_LABELS[smallest.category]} used only ${smallest.percent.toFixed(0)}% of your AI Usage.`);
  }

  return insights;
}

function activityLabel(record: CreditConsumptionRecord): string {
  const category = recordCategory(record);
  return AI_USAGE_CATEGORY_LABELS[category];
}

/** Interactive doughnut — real SVG arcs sized by each category's real share of usage, not a static
 *  image. Hovering an arc or its legend row shows consumed amount, percentage, and what the
 *  category means. */
function UsageDoughnut({ aggregates, total }: { aggregates: CategoryAggregate[]; total: number }) {
  const [hovered, setHovered] = useState<AiUsageCategory | null>(null);
  const size = 200;
  const radius = 74;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const arcs = aggregates.map((agg) => {
    const arcLength = (agg.percent / 100) * circumference;
    const offset = (cumulativePercent / 100) * circumference;
    cumulativePercent += agg.percent;
    return { ...agg, arcLength, offset };
  });

  const active = hovered ? aggregates.find((a) => a.category === hovered) : null;

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          {arcs.map((arc) => (
            <circle
              key={arc.category}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={AI_USAGE_CATEGORY_COLORS[arc.category]}
              strokeWidth={hovered === arc.category ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${arc.arcLength} ${circumference - arc.arcLength}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease, opacity 0.15s ease', opacity: hovered && hovered !== arc.category ? 0.45 : 1 }}
              onMouseEnter={() => setHovered(arc.category)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          {active ? (
            <>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{active.percent.toFixed(0)}%</span>
              <span style={{ fontSize: 11, color: '#96969e', maxWidth: 110 }}>{AI_USAGE_CATEGORY_LABELS[active.category]}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{total}</span>
              <span style={{ fontSize: 11, color: '#96969e' }}>turns tracked</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, flex: 1 }}>
        {arcs.map((arc) => (
          <div
            key={arc.category}
            onMouseEnter={() => setHovered(arc.category)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px',
              borderRadius: 6,
              cursor: 'pointer',
              background: hovered === arc.category ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 999, background: AI_USAGE_CATEGORY_COLORS[arc.category], flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, flex: 1 }}>{AI_USAGE_CATEGORY_LABELS[arc.category]}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#96969e' }}>{arc.percent.toFixed(0)}%</span>
          </div>
        ))}
        {active && (
          <p className={styles.cardBody} style={{ marginTop: 4, fontSize: 11.5 }}>{AI_USAGE_CATEGORY_DESCRIPTIONS[active.category]}</p>
        )}
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
  const [tier, setTier] = useState<SubscriptionTierId | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [history, setHistory] = useState<CreditConsumptionRecord[]>([]);
  const [ticketBalance, setTicketBalance] = useState<TicketBalance | null>(null);
  const [loading, setLoading] = useState(true);
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
      .then(([subscription, creditBalance, creditHistory]) => {
        setTier(subscription.tier);
        setBalance(creditBalance);
        setHistory(creditHistory);
        if (subscription.tier === 'pro' || subscription.tier === 'proMax') {
          autonomousTaskBillingService.getTicketBalance(null).then(setTicketBalance).catch(() => {});
        }
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [user.isGuest]);

  const aggregates = useMemo(() => aggregateByCategory(history), [history]);
  const insights = useMemo(() => buildInsights(aggregates, history), [aggregates, history]);
  const recentActivity = useMemo(() => [...history].sort((a, b) => b.at - a.at).slice(0, 20), [history]);
  const totalTurns = history.reduce((s, r) => s + r.amount, 0);

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

  const usedThisPeriod = balance?.usedThisPeriod ?? 0;
  const limit = balance?.limit ?? null;
  const percentUsed = limit && limit > 0 ? Math.min(100, (usedThisPeriod / limit) * 100) : null;
  const resetsAt = balance?.periodResetsAt ? new Date(balance.periodResetsAt) : null;
  const isTeamOrEnterprise = tier === 'team' || tier === 'enterprise';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* 1. Usage Overview */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Usage Overview</h3>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 10, marginBottom: limit ? 12 : 0 }}>
          <div>
            <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>AI Usage this period</p>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{usedThisPeriod} {usedThisPeriod === 1 ? 'turn' : 'turns'}</p>
          </div>
          <div>
            <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Included limit</p>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{limit === null ? 'Unlimited' : limit}</p>
          </div>
          {resetsAt && (
            <div>
              <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Resets</p>
              <p style={{ fontSize: 20, fontWeight: 700 }}>{resetsAt.toLocaleDateString()}</p>
            </div>
          )}
        </div>
        {percentUsed !== null ? (
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${percentUsed}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--pawos-accent), var(--pawos-accent-2))', transition: 'width 0.3s ease' }} />
          </div>
        ) : (
          <p className={styles.cardBody} style={{ fontSize: 12 }}>
            Your plan currently includes unlimited AI conversation usage — there is no configured monthly cap to track against.
          </p>
        )}
      </div>

      {history.length === 0 ? (
        /* 7. Empty State */
        <div className={styles.card} style={{ textAlign: 'center', padding: '40px 24px' }}>
          <h3 className={styles.cardTitle}>No AI activity yet</h3>
          <p className={styles.cardBody} style={{ marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            Once you start using PawOS, your AI Usage breakdown, activity timeline, and insights will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* 2. AI Usage Breakdown */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>AI Usage Breakdown</h3>
            <div style={{ marginTop: 10 }}>
              <UsageDoughnut aggregates={aggregates} total={totalTurns} />
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
          PawOS tracks two separate balances: your plan&apos;s AI conversation usage (above, currently{' '}
          {limit === null ? 'unlimited on every paid plan' : `capped at ${limit} per period`}), and — for Pro and
          above — a separate dollar-denominated Ticket Balance used only for the Autonomous Ticket System.
        </p>
        {tier === 'pro' || tier === 'proMax' ? (
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
          <p className={styles.cardBody}>Available on Pro and above.</p>
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
