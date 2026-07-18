import * as React from 'react';
import { Text, Row, Column, Hr } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { theme } from '../theme';
import type { BrandingProps } from '../theme';

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ marginBottom: 8 }}>
      <Column>
        <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 12.5, color: theme.colors.textMuted }}>{label}</Text>
      </Column>
      <Column align="right">
        <Text style={{ margin: 0, fontFamily: theme.font, fontSize: 12.5, fontWeight: 600, color: theme.colors.text }}>
          {value}
        </Text>
      </Column>
    </Row>
  );
}

export function Invoice({
  invoiceNumber,
  customerName,
  amount,
  tax,
  date,
  paymentMethod,
  downloadUrl,
  logoFullSrc,
  logoIconSrc,
}: {
  invoiceNumber: string;
  customerName: string;
  amount: string;
  tax: string;
  date: string;
  paymentMethod: string;
  downloadUrl: string;
} & BrandingProps) {
  return (
    <EmailLayout previewText={`Invoice ${invoiceNumber}`} logoFullSrc={logoFullSrc} logoIconSrc={logoIconSrc}>
      <Card>
        <Text style={{ textAlign: 'center', fontFamily: theme.font, fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: '0 0 22px' }}>
          Invoice {invoiceNumber}
        </Text>
        <Line label="Customer" value={customerName} />
        <Line label="Date" value={date} />
        <Line label="Payment method" value={paymentMethod} />
        <Line label="Tax" value={tax} />
        <Hr style={{ borderColor: theme.colors.cardBorder, margin: '10px 0' }} />
        <Line label="Total" value={amount} />
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Button href={downloadUrl}>Download Invoice</Button>
        </div>
      </Card>
    </EmailLayout>
  );
}
