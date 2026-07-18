import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export type NewsletterSection = { title: string; body: string };

/**
 * Covers every marketing category — Newsletter, New AI Features, Tips,
 * Productivity Ideas, Upcoming Releases, Beta Invitations, Community
 * Updates — via flexible headline + sections content rather than one file
 * per topic. Always marked isMarketing so Footer shows Unsubscribe.
 */
export function Newsletter({
  headline,
  intro,
  sections,
  ctaLabel,
  ctaUrl,
  unsubscribeUrl,
  logoFullSrc,
  logoIconSrc,
}: {
  headline: string;
  intro: string;
  sections: NewsletterSection[];
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl: string;
} & BrandingProps) {
  return (
    <EmailLayout
      previewText={headline}
      logoFullSrc={logoFullSrc}
      logoIconSrc={logoIconSrc}
      isMarketing
      unsubscribeUrl={unsubscribeUrl}
    >
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 8px' }}>
          {headline}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          {intro}
        </Text>
        {sections.map((s) => (
          <div key={s.title} style={{ marginBottom: 16 }}>
            <Text style={{ margin: '0 0 3px', fontFamily: theme.font, fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
              {s.title}
            </Text>
            <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 }}>
              {s.body}
            </Text>
          </div>
        ))}
        {ctaLabel && ctaUrl && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Button href={ctaUrl}>{ctaLabel}</Button>
          </div>
        )}
      </Card>
    </EmailLayout>
  );
}
