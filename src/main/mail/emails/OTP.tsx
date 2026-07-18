import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { OTPCard } from '../components/OTPCard';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function OTP({ code, expiresInMinutes, logoFullSrc, logoIconSrc }: { code: string; expiresInMinutes: number } & BrandingProps) {
  return (
    <EmailLayout previewText={`Your PawOS verification code: ${code}`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 6px' }}>
          Your verification code
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted, margin: '0 0 4px' }}>
          Enter this code to continue.
        </Text>
        <OTPCard code={code} expiresInMinutes={expiresInMinutes} />
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12, color: theme.colors.textFaint, margin: '16px 0 0' }}>
          If you didn't request this, please ignore this email.
        </Text>
      </Card>
    </EmailLayout>
  );
}
