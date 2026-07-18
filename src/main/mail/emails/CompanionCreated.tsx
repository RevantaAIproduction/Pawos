import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function CompanionCreated({
  name,
  companionName,
  openUrl,
  logoFullSrc,
  logoIconSrc,
}: { name: string; companionName: string; openUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText={`${companionName} is ready`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          {companionName} is ready
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          Hi {name}, your new companion {companionName} has been created and is ready to meet you.
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={openUrl}>Open PawOS</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
