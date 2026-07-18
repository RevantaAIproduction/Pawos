import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function PaymentSuccess({
  name,
  amount,
  planName,
  invoiceUrl,
  logoFullSrc,
  logoIconSrc,
}: { name: string; amount: string; planName: string; invoiceUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Payment successful" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 34, margin: '0 0 6px' }}>✓</Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.success, margin: '0 0 10px' }}>
          Payment successful
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, we've charged {amount} for your {planName} plan.
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12.5, margin: '16px 0 0' }}>
          <a href={invoiceUrl} style={{ color: theme.colors.primary }}>
            View invoice
          </a>
        </Text>
      </Card>
    </EmailLayout>
  );
}
