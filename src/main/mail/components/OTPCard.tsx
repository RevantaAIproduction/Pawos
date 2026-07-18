import * as React from 'react';
import { Section, Text } from '@react-email/components';
import { theme } from '../theme';

/** The large, unmistakable OTP display — a glowing card with big spaced-out digits. */
export function OTPCard({ code, expiresInMinutes }: { code: string; expiresInMinutes: number }) {
  return (
    <Section
      style={{
        margin: '20px 0',
        padding: '24px',
        borderRadius: 16,
        textAlign: 'center',
        background: 'rgba(47,212,255,0.06)',
        border: `1px solid rgba(47,212,255,0.25)`,
      }}
    >
      <Text
        style={{
          margin: '0 0 8px',
          fontFamily: theme.font,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: '0.25em',
          color: theme.colors.primary,
        }}
      >
        {code}
      </Text>
      <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 12.5, color: theme.colors.textMuted }}>
        Expires in {expiresInMinutes} minutes
      </Text>
    </Section>
  );
}
