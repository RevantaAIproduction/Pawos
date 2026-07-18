import * as React from 'react';
import { Text, Row, Column } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export type SummaryStat = { label: string; value: string };

/** Covers both Weekly Summary and Monthly Summary — same layout, different period label and stats. */
export function PeriodSummary({
  name,
  period,
  stats,
  logoFullSrc,
  logoIconSrc,
}: { name: string; period: 'weekly' | 'monthly'; stats: SummaryStat[] } & BrandingProps) {
  const label = period === 'weekly' ? 'This week' : 'This month';
  return (
    <EmailLayout previewText={`Your ${period} PawOS summary`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 4px' }}>
          {label} with PawOS
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted, margin: '0 0 22px' }}>
          Hi {name}, here's your recap.
        </Text>
        {stats.map((s) => (
          <Row key={s.label} style={{ marginBottom: 10 }}>
            <Column>
              <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted }}>{s.label}</Text>
            </Column>
            <Column align="right">
              <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 13, fontWeight: 700, color: theme.colors.primary }}>
                {s.value}
              </Text>
            </Column>
          </Row>
        ))}
      </Card>
    </EmailLayout>
  );
}
