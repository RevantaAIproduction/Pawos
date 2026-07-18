import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function VerifyEmail({ name, verifyUrl, logoFullSrc, logoIconSrc }: { name: string; verifyUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Confirm your email to finish setting up PawOS" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Confirm your email
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          Hi {name}, one last step — confirm this is your email address to finish setting up your PawOS account.
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={verifyUrl}>Confirm Email</Button>
        </div>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12, color: theme.colors.textFaint, margin: '20px 0 0' }}>
          If you didn't create a PawOS account, you can safely ignore this email.
        </Text>
      </Card>
    </EmailLayout>
  );
}
