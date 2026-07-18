import * as React from 'react';
import { Section } from '@react-email/components';
import { theme } from '../theme';

/** The "glass card" every email's main content sits in. */
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <Section
      style={{
        margin: '0 32px',
        padding: '32px',
        borderRadius: 20,
        background: theme.colors.card,
        border: `1px solid ${theme.colors.cardBorder}`,
      }}
    >
      {children}
    </Section>
  );
}
