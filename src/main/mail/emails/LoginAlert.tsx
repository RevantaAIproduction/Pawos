import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

/** Covers both "Login Success" and "Login From New Device" — same layout, different headline/emphasis. */
export function LoginAlert({
  name,
  variant,
  whenText,
  device,
  location,
  logoFullSrc,
  logoIconSrc,
}: {
  name: string;
  variant: 'success' | 'newDevice';
  whenText: string;
  device?: string;
  location?: string;
} & BrandingProps) {
  const isNewDevice = variant === 'newDevice';
  return (
    <EmailLayout
      previewText={isNewDevice ? 'New sign-in to your PawOS account' : 'You just signed in to PawOS'}
      logoFullSrc={logoFullSrc}
      logoIconSrc={logoIconSrc}
    >
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          {isNewDevice ? 'New sign-in from an unrecognized device' : 'Signed in successfully'}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          Hi {name}, your account was signed into on {whenText}
          {device ? ` from ${device}` : ''}
          {location ? ` (${location})` : ''}.
        </Text>
        {isNewDevice && (
          <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 12.5, color: theme.colors.danger, margin: '16px 0 0' }}>
            Don't recognize this? Contact support@revantaai.com and change your password.
          </Text>
        )}
      </Card>
    </EmailLayout>
  );
}
