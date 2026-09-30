import React from 'react';
import { SubscriptionSection } from './SubscriptionSection';
import type { AuthUser } from '../../../auth/AuthTypes';

// Autonomous Work Credits are bought from SubscriptionSection's AutonomousCreditsPanel (and the
// Ticket Wallet in the top bar) — there is no second personal-balance card here.
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
    </div>
  );
}
