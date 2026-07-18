import * as React from 'react';
import { Text, Row, Column } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

const FEATURES = [
  { title: 'Your Virtual Friend', body: 'A companion that lives on your desktop, not just in a chat window.' },
  { title: 'AI Companion', body: 'Real conversation, powered by whichever AI provider you connect.' },
  { title: 'Desktop Experience', body: 'Walks, sits, reacts to what you’re doing — not a static icon.' },
  { title: 'Memory', body: 'Remembers context across conversations instead of starting fresh every time.' },
  { title: 'Automation', body: 'Hands off real tasks on your machine, with your permission at every step.' },
];

export function Welcome({ name, launchUrl, logoFullSrc, logoIconSrc }: { name: string; launchUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText={`Welcome to PawOS, ${name}`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Logo variant="full" src={logoFullSrc} />
        </div>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 22, fontWeight: 700, color: theme.colors.text, margin: '4px 0 4px' }}>
          Welcome to PawOS, {name}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 24px' }}>
          Here's what you just got access to.
        </Text>

        {FEATURES.map((f) => (
          <Row key={f.title} style={{ marginBottom: 14 }}>
            <Column>
              <Text style={{ margin: '0 0 2px', fontFamily: theme.font, fontSize: 14, fontWeight: 600, color: theme.colors.text }}>
                {f.title}
              </Text>
              <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted }}>{f.body}</Text>
            </Column>
          </Row>
        ))}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Button href={launchUrl}>Launch PawOS</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
