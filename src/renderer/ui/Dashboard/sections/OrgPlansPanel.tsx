import React from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SubscriptionTierId } from '../../../../shared/billing/BillingTypes';

/**
 * Upgrade > Team and Enterprise. Both plans are sold through sales: "Contact sales" opens the
 * website's sales page for that plan (pawos.revantaai.com/support/sales), the same page the
 * website's pricing links to. Plan facts mirror PricingConfigStore.ts and the website's pricing.
 */

const SALES_URL = 'https://pawos.revantaai.com/support/sales';

type FeatureGroup = { title: string; items: string[] };

interface OrgPlan {
  id: 'team' | 'enterprise';
  name: string;
  summary: string;
  audience: string;
  price: string;
  priceUnit: string;
  priceNote: string;
  inherits: string;
  groups: FeatureGroup[];
  highlighted?: boolean;
}

const PLANS: OrgPlan[] = [
  {
    id: 'team',
    name: 'Team',
    summary: 'Predictable usage per seat, with shared workspaces and admin controls.',
    audience: '2–150 members',
    price: '$20',
    priceUnit: 'per seat / month',
    priceNote: 'Premium seats $100 per seat / month',
    inherits: 'Everything in Pro Max, plus',
    groups: [
      { title: 'Collaboration', items: ['Shared workspaces and companions', 'Task management and assignment', 'AI-assisted Git collaboration (PR review)', 'Remote assistance (screen share and control)'] },
      { title: 'Administration and security', items: ['Organization members and admin controls', 'Credential vault and approval queue', 'Audit log', 'SSO configuration (policy-level)'] },
      { title: 'Billing', items: ['Team billing with Standard and Premium seats', 'Shared credits (credit pool)', 'CRM projection'] },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    summary: 'Flexible pooled usage and advanced roles for organizations at scale.',
    audience: '20+ members',
    price: '$20',
    priceUnit: 'per seat / month',
    priceNote: 'Plus usage at API rates',
    inherits: 'Everything in Team, plus',
    highlighted: true,
    groups: [
      {
        title: 'Usage and billing',
        items: [
          'Uniform seat rate — no Standard / Premium split',
          'Autonomous Ticket System billed at pass-through API rates',
          'Charged only for completed tasks — never failed, cancelled or denied runs',
        ],
      },
      { title: 'Governance', items: ['Additional roles: IT Administrator, Security Administrator, Department Manager'] },
    ],
  },
];

const SEATS = [
  { name: 'Standard', price: '$20', detail: 'Everything in Pro Max for each member' },
  { name: 'Premium', price: '$100', detail: 'Pro Max-equivalent usage headroom' },
];

const border = '1px solid rgba(var(--pawos-overlay-rgb), 0.12)';
const muted = { fontSize: 12, opacity: 0.6 } as const;

function contactSales(plan?: OrgPlan['id']) {
  void ipc.actionExecute({ type: 'openUrl', url: plan ? `${SALES_URL}?plan=${plan}` : SALES_URL });
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3, color: '#60a5fa' }}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ plan, current }: { plan: OrgPlan; current: boolean }) {
  return (
    <div
      className={styles.card}
      data-testid={`org-plan-${plan.id}`}
      style={{
        flex: '1 1 320px',
        maxWidth: 420,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        ...(plan.highlighted ? { border: '1px solid rgba(96, 165, 250, 0.4)', boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.12)' } : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 className={styles.cardTitle} style={{ fontSize: 18 }}>{plan.name}</h3>
        <span style={{ border, borderRadius: 999, padding: '2px 10px', fontSize: 11.5, opacity: 0.8 }}>{plan.audience}</span>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 6, fontSize: 13 }}>{plan.summary}</p>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>{plan.price}</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>{plan.priceUnit}</span>
        </div>
        <p style={{ ...muted, marginTop: 2 }}>{plan.priceNote}</p>
      </div>

      {current ? (
        <span className={styles.chip} style={{ marginTop: 18, alignSelf: 'flex-start' }}>Current plan</span>
      ) : (
        <button
          type="button"
          className={styles.primaryButton}
          style={{ marginTop: 18, width: '100%', textAlign: 'center' }}
          onClick={() => contactSales(plan.id)}
          data-testid={`contact-sales-${plan.id}`}
        >
          Contact sales
        </button>
      )}

      {plan.id === 'team' && (
        <div style={{ marginTop: 18, border, borderRadius: 10 }}>
          {SEATS.map((seat, index) => (
            <div
              key={seat.name}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderTop: index === 0 ? undefined : border }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{seat.name} seat</div>
                <div style={muted}>{seat.detail}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {seat.price}
                <span style={{ fontWeight: 400, opacity: 0.6 }}> /mo</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 18, borderTop: border }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>{plan.inherits}:</p>
        {plan.groups.map((group) => (
          <div key={group.title} style={{ marginTop: 14 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}>{group.title}</p>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {group.items.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 8, fontSize: 13, opacity: 0.88 }}>
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrgPlansPanel({ currentTier }: { currentTier: SubscriptionTierId }) {
  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 20, width: '100%' }}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={currentTier === plan.id} />
        ))}
      </div>
      <div
        className={styles.card}
        style={{ width: '100%', maxWidth: 860, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '16px 20px' }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Not sure which plan fits?</div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>We&apos;ll help you size seats and usage and plan the rollout for your organization.</div>
        </div>
        <button type="button" className={styles.chip} onClick={() => contactSales()}>
          Talk to sales →
        </button>
      </div>
    </div>
  );
}
