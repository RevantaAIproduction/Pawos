import React from 'react';
import { SubscriptionSection } from './SubscriptionSection';
import { UsageSection } from './UsageSection';
import { TaskCreditsSection } from './TaskCreditsSection';
import { ReferralSection } from './ReferralSection';
import type { AuthUser } from '../../../auth/AuthTypes';

/**
 * Billing tab: plan/credits/models (SubscriptionSection), prepaid Autonomous
 * Engineering Task credits for individual Pro/Pro Max accounts
 * (TaskCreditsSection — Team/Enterprise members manage this from their
 * Organization's own card instead), the referral engine (ReferralSection —
 * rewards land in this same task-credit balance), plus real usage numbers
 * (UsageSection).
 */
export function BillingSettingsPage({
  user,
  onGoToAccount,
  onUpgrade,
}: {
  user: AuthUser;
  onGoToAccount: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div>
      <SubscriptionSection user={user} onGoToAccount={onGoToAccount} onUpgrade={onUpgrade} />
      <div style={{ marginTop: 14 }}>
        <TaskCreditsSection user={user} />
      </div>
      <div style={{ marginTop: 14 }}>
        <ReferralSection user={user} />
      </div>
      <div style={{ marginTop: 14 }}>
        <UsageSection user={user} onGoToAccount={onGoToAccount} />
      </div>
    </div>
  );
}
