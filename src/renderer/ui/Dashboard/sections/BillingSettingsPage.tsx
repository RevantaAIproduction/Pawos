import React from 'react';
import { SubscriptionSection } from './SubscriptionSection';
import { TaskCreditsSection } from './TaskCreditsSection';
import type { AuthUser } from '../../../auth/AuthTypes';

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
    </div>
  );
}
