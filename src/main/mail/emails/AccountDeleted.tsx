import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function AccountDeleted({ name, logoFullSrc, logoIconSrc }: { name: string } & BrandingProps) {
  return (
    <EmailLayout previewText="Your PawOS account has been deleted" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Your account has been deleted
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Hi {name}, this confirms your PawOS account and its data have been deleted. If this wasn't you, contact
          support@revantaai.com right away.
        </Text>
      </Card>
    </EmailLayout>
  );
}
