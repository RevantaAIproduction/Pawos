import React from 'react';
import { SubscriptionSection } from './SubscriptionSection';
import { UsageSection } from './UsageSection';
import { TaskCreditsSection } from './TaskCreditsSection';
import type { AuthUser } from '../../../auth/AuthTypes';

/**
 * Billing tab: plan/credits/models (SubscriptionSection), prepaid Autonomous
 * Engineering Task credits for individual Pro/Pro Max accounts
 * (TaskCreditsSection — Team/Enterprise members manage this from their
 * Organization's own card instead), plus real usage numbers (UsageSection).
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
      <TaskCreditsSection user={user} />
      <UsageSection user={user} onGoToAccount={onGoToAccount} />
    </div>
  );
}
