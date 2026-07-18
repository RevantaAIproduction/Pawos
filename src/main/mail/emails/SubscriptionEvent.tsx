import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export type SubscriptionVariant = 'trialStarted' | 'trialEnding' | 'purchased' | 'renewed' | 'cancelled';

const COPY: Record<SubscriptionVariant, { headline: string; preview: string }> = {
  trialStarted: { headline: 'Your free trial has started', preview: 'Your PawOS trial has started' },
  trialEnding: { headline: 'Your trial is ending soon', preview: 'Your PawOS trial is ending soon' },
  purchased: { headline: 'Subscription confirmed', preview: 'Your PawOS subscription is active' },
  renewed: { headline: 'Your subscription renewed', preview: 'Your PawOS subscription renewed' },
  cancelled: { headline: 'Your subscription was cancelled', preview: 'Your PawOS subscription was cancelled' },
};

/** Covers Trial Started/Ending, Subscription Purchased/Renewed/Cancelled — same layout, different copy per variant. */
export function SubscriptionEvent({
  name,
  variant,
  planName,
  detailText,
  manageUrl,
  logoFullSrc,
  logoIconSrc,
}: {
  name: string;
  variant: SubscriptionVariant;
  planName: string;
  detailText: string;
  manageUrl: string;
} & BrandingProps) {
  const copy = COPY[variant];
  return (
    <EmailLayout previewText={copy.preview} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          {copy.headline}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, {detailText}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13, fontWeight: 600, color: theme.colors.primary, margin: '10px 0 22px' }}>
          Plan: {planName}
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={manageUrl}>Manage Subscription</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
