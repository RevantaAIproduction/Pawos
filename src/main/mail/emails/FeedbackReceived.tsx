import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function FeedbackReceived({
  rating,
  comment,
  fromName,
  appVersion,
  logoFullSrc,
  logoIconSrc,
}: { rating: number; comment?: string; fromName: string; appVersion: string } & BrandingProps) {
  return (
    <EmailLayout previewText={`New PawOS feedback: ${rating}/5 stars`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          New feedback: {rating}/5 stars
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
          From {fromName} — PawOS v{appVersion}
        </Text>
        {comment && (
          <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.text, margin: '16px 0 0', lineHeight: 1.6 }}>
            "{comment}"
          </Text>
        )}
      </Card>
    </EmailLayout>
  );
}
