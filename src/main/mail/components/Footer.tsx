import * as React from 'react';
import { Section, Text, Link, Hr } from '@react-email/components';
import { Logo } from './Logo';
import { theme } from '../theme';

export function Footer({
  logoIconSrc,
  isMarketing = false,
  unsubscribeUrl,
}: {
  logoIconSrc: string;
  isMarketing?: boolean;
  unsubscribeUrl?: string;
}) {
  return (
    <Section style={{ padding: '24px 32px 32px', textAlign: 'center' }}>
      <Hr style={{ borderColor: theme.colors.cardBorder, margin: '0 0 20px' }} />
      <div style={{ marginBottom: 10 }}>
        <Logo variant="icon" src={logoIconSrc} />
      </div>
      <Text style={{ margin: '0 0 4px', fontFamily: theme.font, fontSize: 13, fontWeight: 600, color: theme.colors.textMuted }}>
        PawOS
      </Text>
      <Text style={{ margin: '0 0 12px', fontFamily: theme.font, fontSize: 11, color: theme.colors.textFaint }}>
        Powered by Revanta AI
      </Text>
      <Text style={{ margin: '0 0 12px', fontFamily: theme.font, fontSize: 11, color: theme.colors.textFaint }}>
        <Link href="mailto:support@revantaai.com" style={{ color: theme.colors.textFaint }}>
          support@revantaai.com
        </Link>
      </Text>
      <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 11, color: theme.colors.textFaint }}>
        <Link href="https://revantaai.com/privacy" style={{ color: theme.colors.textFaint }}>
          Privacy Policy
        </Link>
        {'  ·  '}
        <Link href="https://revantaai.com/terms" style={{ color: theme.colors.textFaint }}>
          Terms
        </Link>
        {isMarketing && unsubscribeUrl && (
          <>
            {'  ·  '}
            <Link href={unsubscribeUrl} style={{ color: theme.colors.textFaint }}>
              Unsubscribe
            </Link>
          </>
        )}
      </Text>
    </Section>
  );
}
