import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function GoogleAccountLinked({ name, email, logoFullSrc, logoIconSrc }: { name: string; email: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Your Google account is now linked to PawOS" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Google account linked
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Hi {name}, your Google account ({email}) is now linked to PawOS. You can use "Continue with Google" to sign in from now on.
        </Text>
      </Card>
    </EmailLayout>
  );
}
