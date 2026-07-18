import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function MemoryBackupComplete({
  name,
  whenText,
  itemCount,
  logoFullSrc,
  logoIconSrc,
}: { name: string; whenText: string; itemCount: number } & BrandingProps) {
  return (
    <EmailLayout previewText="Your PawOS memory backup completed" logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          Memory backup complete
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Hi {name}, your companion's memory ({itemCount} items) was backed up successfully on {whenText}.
        </Text>
      </Card>
    </EmailLayout>
  );
}
