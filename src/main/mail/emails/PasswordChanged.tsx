import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function PasswordChanged({ name, whenText, logoFullSrc, logoIconSrc }: { name: string; whenText: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Your PawOS password was changed" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Your password was changed
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, this confirms your PawOS password was changed on {whenText}.
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12.5, color: theme.colors.danger, margin: '16px 0 0' }}>
          Wasn't you? Contact support@revantaai.com immediately.
        </Text>
      </Card>
    </EmailLayout>
  );
}
