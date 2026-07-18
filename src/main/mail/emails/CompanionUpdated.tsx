import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function CompanionUpdated({
  name,
  companionName,
  changeSummary,
  logoFullSrc,
  logoIconSrc,
}: { name: string; companionName: string; changeSummary: string } & BrandingProps) {
  return (
    <EmailLayout previewText={`${companionName} was updated`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          {companionName} was updated
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Hi {name}, here's what changed: {changeSummary}
        </Text>
      </Card>
    </EmailLayout>
  );
}
