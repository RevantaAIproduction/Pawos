import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function PasswordReset({ name, resetUrl, logoFullSrc, logoIconSrc }: { name: string; resetUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Reset your PawOS password" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Reset your password
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          Hi {name}, we received a request to reset your PawOS password. This link expires in 15 minutes and can only be used once.
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={resetUrl}>Reset Password</Button>
        </div>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12, color: theme.colors.textFaint, margin: '20px 0 0' }}>
          If you didn't request this, please ignore this email — your password won't be changed.
        </Text>
      </Card>
    </EmailLayout>
  );
}
