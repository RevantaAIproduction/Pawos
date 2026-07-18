import * as React from 'react';
import { Section, Text } from '@react-email/components';
import { Logo } from './Logo';
import { theme } from '../theme';

/** Compact header for every email — the real logo icon plus the wordmark as text, so it stays small enough for a header bar (the full lockup image is reserved for hero placements like the Welcome email). */
export function Header({ logoIconSrc }: { logoIconSrc: string }) {
  return (
    <Section style={{ padding: '28px 32px 20px', textAlign: 'center' }}>
      <table role="presentation" style={{ margin: '0 auto' }}>
        <tr>
          <td style={{ paddingRight: 10, verticalAlign: 'middle' }}>
            <Logo variant="icon" src={logoIconSrc} />
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <Text
              style={{
                margin: 0,
                fontFamily: theme.font,
                fontSize: 20,
                fontWeight: 700,
                color: theme.colors.text,
                letterSpacing: '-0.01em',
              }}
            >
              PawOS
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  );
}
