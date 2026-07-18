import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function EmailChanged({
  name,
  oldEmail,
  newEmail,
  logoFullSrc,
  logoIconSrc,
}: { name: string; oldEmail: string; newEmail: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Your PawOS account email was changed" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Your account email was changed
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, your PawOS account email was changed from {oldEmail} to {newEmail}.
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12.5, color: theme.colors.danger, margin: '16px 0 0' }}>
          Wasn't you? Contact support@revantaai.com immediately.
        </Text>
      </Card>
    </EmailLayout>
  );
}
