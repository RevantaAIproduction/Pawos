import React, { useState } from 'react';
import { SubscriptionSection } from './SubscriptionSection';
import { UsageSection } from './UsageSection';
import { TaskCreditsSection } from './TaskCreditsSection';
import { SectionHub, SectionDetail, type SectionTileDef } from '../SectionHub';
import { CardIcon, GaugeIcon, BarsIcon } from '../NavIcons';
import type { AuthUser } from '../../../auth/AuthTypes';

const BILLING_TILES: SectionTileDef[] = [
  { id: 'subscription', title: 'Plan & Models', description: 'Your current plan, AI models, and upgrade options.', icon: CardIcon },
  { id: 'taskCredits', title: 'Autonomous Ticket Balance & Pricing', description: 'Prepaid balance and per-ticket pricing for autonomous engineering tickets.', icon: GaugeIcon },
  { id: 'usage', title: 'Usage Statistics', description: 'Runtime, companion, and storage usage this period.', icon: BarsIcon },
];

/**
 * Billing tab: plan/credits/models (SubscriptionSection), prepaid Autonomous
 * Engineering Task credits for individual Pro/Pro Max accounts
 * (TaskCreditsSection — Team/Enterprise members manage this from their
 * Organization's own card instead), plus real usage numbers (UsageSection) —
 * presented as click-to-open tiles rather than every section forced open in one scroll.
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
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) {
    return (
      <SectionDetail title={BILLING_TILES.find((t) => t.id === selected)?.title ?? ''} onBack={() => setSelected(null)}>
        {selected === 'subscription' && <SubscriptionSection user={user} onGoToAccount={onGoToAccount} onUpgrade={onUpgrade} />}
        {selected === 'taskCredits' && <TaskCreditsSection user={user} />}
        {selected === 'usage' && <UsageSection user={user} onGoToAccount={onGoToAccount} />}
      </SectionDetail>
    );
  }

  return <SectionHub tiles={BILLING_TILES} onSelect={setSelected} />;
}
