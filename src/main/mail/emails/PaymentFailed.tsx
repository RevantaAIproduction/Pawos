import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function PaymentFailed({
  name,
  amount,
  planName,
  updatePaymentUrl,
  logoFullSrc,
  logoIconSrc,
}: { name: string; amount: string; planName: string; updatePaymentUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Payment failed — action needed" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.danger, margin: '0 0 10px' }}>
          Payment failed
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          Hi {name}, we couldn't process {amount} for your {planName} plan. Please update your payment method to keep your
          subscription active.
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={updatePaymentUrl}>Update Payment Method</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
