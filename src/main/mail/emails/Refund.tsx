import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function Refund({
  name,
  amount,
  reason,
  logoFullSrc,
  logoIconSrc,
}: { name: string; amount: string; reason?: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Your refund has been processed" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Refund processed
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, we've refunded {amount} to your original payment method. It may take a few business days to appear.
        </Text>
        {reason && (
          <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12.5, color: theme.colors.textFaint, margin: '10px 0 0' }}>
            Reason: {reason}
          </Text>
        )}
      </Card>
    </EmailLayout>
  );
}
