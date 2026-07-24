import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

export function OrganizationInvite({
  organizationName,
  role,
  inviterName,
  openUrl,
  logoFullSrc,
  logoIconSrc,
}: { organizationName: string; role: string; inviterName: string; openUrl: string } & BrandingProps) {
  return (
    <EmailLayout previewText={`You've been invited to ${organizationName} on PawOS`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Logo variant="full" src={logoFullSrc} />
        </div>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 22, fontWeight: 700, color: theme.colors.text, margin: '4px 0 4px' }}>
          You've been invited to {organizationName}
        </Text>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 13.5, color: theme.colors.textMuted, margin: '0 0 24px' }}>
          {inviterName} invited you to join {organizationName} on PawOS as {role}.
        </Text>
        <Text style={{ fontFamily: theme.font, fontSize: 13, color: theme.colors.textMuted, margin: '0 0 20px' }}>
          Sign in to PawOS with this email address to accept the invitation and join the organization.
        </Text>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Button href={openUrl}>Open PawOS</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
