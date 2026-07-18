import * as React from 'react';
import { Html, Head, Preview, Body, Container } from '@react-email/components';
import { Header } from './Header';
import { Footer } from './Footer';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

/**
 * The Html/Head/Body/Header/Footer scaffolding every one of the ~20 email
 * templates shares — not explicitly named in the component list, but this
 * is what keeps each individual template file small and consistent instead
 * of every one re-declaring the same wrapper markup.
 */
export function EmailLayout({
  previewText,
  logoFullSrc: _logoFullSrc,
  logoIconSrc,
  isMarketing,
  unsubscribeUrl,
  children,
}: BrandingProps & {
  previewText: string;
  isMarketing?: boolean;
  unsubscribeUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ background: theme.colors.background, margin: 0, padding: '32px 0' }}>
        <Container style={{ maxWidth: 480, margin: '0 auto' }}>
          <Header logoIconSrc={logoIconSrc} />
          {children}
          <Footer logoIconSrc={logoIconSrc} isMarketing={isMarketing} unsubscribeUrl={unsubscribeUrl} />
        </Container>
      </Body>
    </Html>
  );
}
