import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function TokenPurchase({
  name,
  tokenAmount,
  newBalance,
  logoFullSrc,
  logoIconSrc,
}: { name: string; tokenAmount: string; newBalance: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Token purchase successful" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Token purchase successful
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, {tokenAmount} tokens were added to your account.
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13, fontWeight: 600, color: theme.colors.primary, margin: '10px 0 0' }}>
          New balance: {newBalance}
        </Text>
      </Card>
    </EmailLayout>
  );
}
