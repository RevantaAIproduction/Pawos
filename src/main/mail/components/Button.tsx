import * as React from 'react';
import { Button as EmailButton } from '@react-email/components';
import { theme } from '../theme';

export function Button({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <EmailButton
      href={href}
      style={{
        display: 'inline-block',
        padding: '13px 28px',
        borderRadius: 999,
        background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
        color: '#08080A',
        fontFamily: theme.font,
        fontSize: 14,
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      {children}
    </EmailButton>
  );
}
