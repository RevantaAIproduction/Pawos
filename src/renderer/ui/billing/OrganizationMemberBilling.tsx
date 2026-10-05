import React, { useState } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import { PlanUsageLimits } from './PlanUsageLimits';
import { useEntitlementSnapshot } from '../../billing/useEntitlementSnapshot';
import type { OrganizationBilling } from '../../organization/useOrganizationBilling';

/**
 * What a Team / Enterprise member (not an admin) sees for billing: their plan and seat, their own
 * usage — the same meters as Pro and Pro Max — and who to ask for more. No buying, upgrading or
 * cancelling: their organization's owner or billing administrator does that.
 */
export function OrganizationMemberBilling({ billing }: { billing: OrganizationBilling }) {
  const entitlement = useEntitlementSnapshot();
  const [copied, setCopied] = useState<string | null>(null);
  const plan = billing.organization.tier === 'enterprise' ? 'Enterprise' : 'Team';
  const seat = billing.organization.tier === 'team' ? (billing.seatTier === 'premium' ? 'Premium seat' : 'Standard seat') : null;

  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // The address is on screen to copy by hand.
    }
  };

  return (
    <div data-testid="org-member-billing">
      <div className={styles.card}>
        <p className={styles.cardBody} style={{ fontSize: 12 }}>Current plan</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <h3 className={styles.cardTitle} style={{ fontSize: 18 }} data-testid="current-plan-label">
            Paw {plan}
          </h3>
          {seat && <span className={styles.chip}>{seat}</span>}
        </div>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          {billing.organization.name} · {billing.roleLabel}
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h3 className={styles.cardTitle}>Your usage</h3>
        <div style={{ marginTop: 10 }}>
          <PlanUsageLimits entitlement={entitlement} />
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <h3 className={styles.cardTitle}>Need more usage?</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Your organization&apos;s admins handle purchases for {billing.organization.name} — plans, seats and credits. Ask one of them to
          add more for you.
        </p>
        {billing.billingAdmins.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {billing.billingAdmins.map((admin) => (
              <li key={admin.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                  {admin.displayName ? `${admin.displayName} · ` : ''}
                  <span style={{ opacity: 0.7 }}>{admin.email}</span>
                </span>
                <button type="button" className={styles.chip} onClick={() => void copy(admin.email)}>
                  {copied === admin.email ? 'Copied' : 'Copy email'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
