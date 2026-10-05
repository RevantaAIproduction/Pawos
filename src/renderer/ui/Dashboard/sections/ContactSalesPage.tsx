import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

/**
 * Contact sales for Team and Enterprise — the same page as the website's /support/sales
 * (pawos-web/src/app/support/sales/page.tsx): pick the plan, then email the sales team.
 * Reached only from the Contact sales button on each plan's card (Upgrade > Team and Enterprise).
 */

export type SalesPlanId = 'team' | 'enterprise';

const SALES_EMAIL = 'sales@revantaai.com';

const PLANS: Record<SalesPlanId, { name: string; price: string; detail: string; subject: string }> = {
  team: {
    name: 'Team',
    price: '$20 per seat / month',
    detail: 'Standard and Premium seats · 2–150 members',
    subject: 'PawOS Team plan inquiry',
  },
  enterprise: {
    name: 'Enterprise',
    price: '$20 per seat / month + usage',
    detail: 'Pooled usage at API rates · 20+ members',
    subject: 'PawOS Enterprise plan inquiry',
  },
};

const INCLUDE = [
  'Your organization and how many people will use PawOS',
  'Which plan you’re considering, and Standard / Premium seat mix for Team',
  'When you’d like to roll out',
  'Any security, SSO or compliance requirements',
];

const border = '1px solid rgba(var(--pawos-overlay-rgb), 0.12)';

export function salesMailto(plan: SalesPlanId): string {
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(PLANS[plan].subject)}`;
}

export function ContactSalesPage({ plan: initialPlan, onBack }: { plan: SalesPlanId; onBack: () => void }) {
  const [plan, setPlan] = useState<SalesPlanId>(initialPlan);
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SALES_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is on screen to copy by hand.
    }
  };

  return (
    <div data-testid="contact-sales-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <button type="button" className={styles.upgradeBackLink} onClick={onBack}>
        ‹ Back to plans
      </button>

      <p style={{ marginTop: 18, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#60a5fa' }}>
        Team and Enterprise
      </p>
      <h2 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>Talk to sales</h2>
      <p className={styles.cardBody} style={{ marginTop: 8, fontSize: 14 }}>
        We’ll help you choose the right plan, size seats and usage, and get your organization set up on PawOS.
      </p>

      <div role="radiogroup" aria-label="Plan" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {(Object.keys(PLANS) as SalesPlanId[]).map((id) => {
          const item = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlan(id)}
              data-testid={`sales-plan-${id}`}
              style={{
                textAlign: 'left',
                padding: 16,
                borderRadius: 12,
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                background: active ? 'rgba(59, 130, 246, 0.07)' : 'transparent',
                border: active ? '1px solid rgba(96, 165, 250, 0.5)' : border,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</span>
                {active && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#93c5fd' }}>Selected</span>}
              </div>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.85 }}>{item.price}</div>
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.55 }}>{item.detail}</div>
            </button>
          );
        })}
      </div>

      <div className={styles.card} style={{ marginTop: 16, padding: 24 }}>
        <h3 className={styles.cardTitle} style={{ fontSize: 16 }}>Email our sales team</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Write to <strong style={{ fontWeight: 600 }}>{SALES_EMAIL}</strong> and we’ll get back to you. It helps to include:
        </p>
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {INCLUDE.map((item) => (
            <li key={item} style={{ display: 'flex', gap: 10, fontSize: 13, opacity: 0.88 }}>
              <span aria-hidden="true" style={{ marginTop: 8, width: 4, height: 4, borderRadius: 999, background: 'currentColor', opacity: 0.5, flexShrink: 0 }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.primaryButton}
            data-testid="email-sales"
            onClick={() => void ipc.actionExecute({ type: 'openUrl', url: salesMailto(plan) })}
          >
            Email sales
          </button>
          <button type="button" className={styles.chip} onClick={() => void copyEmail()}>
            {copied ? 'Copied' : 'Copy email address'}
          </button>
        </div>
      </div>
    </div>
  );
}
