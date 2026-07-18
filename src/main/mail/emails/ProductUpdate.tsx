import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export type ProductUpdateVariant = 'update' | 'newFeature' | 'releaseNotes';

const LABELS: Record<ProductUpdateVariant, string> = {
  update: 'Product update',
  newFeature: 'New feature',
  releaseNotes: 'Release notes',
};

/** Covers Product Updates, New Features, and Release Notes — same layout, different label/copy. */
export function ProductUpdate({
  variant,
  title,
  body,
  learnMoreUrl,
  logoFullSrc,
  logoIconSrc,
}: {
  variant: ProductUpdateVariant;
  title: string;
  body: string;
  learnMoreUrl: string;
} & BrandingProps) {
  return (
    <EmailLayout previewText={title} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.colors.accent, margin: '0 0 8px' }}>
          {LABELS[variant]}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 10px' }}>
          {title}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 22px', lineHeight: 1.6 }}>
          {body}
        </Text>
        <div style={{ textAlign: 'center' }}>
          <Button href={learnMoreUrl}>Learn More</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
