import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { render } from '@react-email/render';
import { getBrandingDir } from '../assets/AssetPathResolver';
import type { BrandingProps } from './theme';

import { Welcome } from './emails/Welcome';
import { OTP } from './emails/OTP';
import { VerifyEmail } from './emails/VerifyEmail';
import { PasswordReset } from './emails/PasswordReset';
import { PasswordChanged } from './emails/PasswordChanged';
import { LoginAlert } from './emails/LoginAlert';
import { GoogleAccountLinked } from './emails/GoogleAccountLinked';
import { EmailChanged } from './emails/EmailChanged';
import { AccountDeleted } from './emails/AccountDeleted';
import { SubscriptionEvent } from './emails/SubscriptionEvent';
import { PaymentSuccess } from './emails/PaymentSuccess';
import { PaymentFailed } from './emails/PaymentFailed';
import { Invoice } from './emails/Invoice';
import { Refund } from './emails/Refund';
import { TokenPurchase } from './emails/TokenPurchase';
import { CompanionCreated } from './emails/CompanionCreated';
import { CompanionUpdated } from './emails/CompanionUpdated';
import { MemoryBackupComplete } from './emails/MemoryBackupComplete';
import { PeriodSummary } from './emails/PeriodSummary';
import { ProductUpdate } from './emails/ProductUpdate';
import { Newsletter } from './emails/Newsletter';

type TemplateEntry = { label: string; build: (b: BrandingProps) => React.ReactElement };

const NOW = 'Jul 11, 2026, 5:04 PM';

/**
 * Fixed dummy data for every template + variant, used only to render a
 * preview inside the app — nothing here ever gets sent. Kept separate from
 * EmailService (which renders with real caller-supplied params).
 */
const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: { label: 'Welcome', build: (b) => React.createElement(Welcome, { name: 'Alex', launchUrl: 'https://revantaai.com', ...b }) },
  otp: { label: 'OTP Code', build: (b) => React.createElement(OTP, { code: '482913', expiresInMinutes: 5, ...b }) },
  verifyEmail: {
    label: 'Verify Email',
    build: (b) => React.createElement(VerifyEmail, { name: 'Alex', verifyUrl: 'https://revantaai.com/verify?token=demo', ...b }),
  },
  passwordReset: {
    label: 'Password Reset',
    build: (b) => React.createElement(PasswordReset, { name: 'Alex', resetUrl: 'https://revantaai.com/reset?token=demo', ...b }),
  },
  passwordChanged: { label: 'Password Changed', build: (b) => React.createElement(PasswordChanged, { name: 'Alex', whenText: NOW, ...b }) },
  loginAlertSuccess: {
    label: 'Login Alert — Success',
    build: (b) => React.createElement(LoginAlert, { name: 'Alex', variant: 'success', whenText: NOW, ...b }),
  },
  loginAlertNewDevice: {
    label: 'Login Alert — New Device',
    build: (b) =>
      React.createElement(LoginAlert, {
        name: 'Alex',
        variant: 'newDevice',
        whenText: NOW,
        device: 'Windows PC — Chrome',
        location: 'Bengaluru, IN',
        ...b,
      }),
  },
  googleAccountLinked: {
    label: 'Google Account Linked',
    build: (b) => React.createElement(GoogleAccountLinked, { name: 'Alex', email: 'alex@example.com', ...b }),
  },
  emailChanged: {
    label: 'Email Changed',
    build: (b) => React.createElement(EmailChanged, { name: 'Alex', oldEmail: 'old@example.com', newEmail: 'new@example.com', ...b }),
  },
  accountDeleted: { label: 'Account Deleted', build: (b) => React.createElement(AccountDeleted, { name: 'Alex', ...b }) },
  subscriptionTrialStarted: {
    label: 'Subscription — Trial Started',
    build: (b) =>
      React.createElement(SubscriptionEvent, {
        name: 'Alex',
        variant: 'trialStarted',
        planName: 'Pro',
        detailText: 'your 14-day free trial of PawOS Pro has started.',
        manageUrl: 'https://revantaai.com/account/subscription',
        ...b,
      }),
  },
  subscriptionTrialEnding: {
    label: 'Subscription — Trial Ending',
    build: (b) =>
      React.createElement(SubscriptionEvent, {
        name: 'Alex',
        variant: 'trialEnding',
        planName: 'Pro',
        detailText: 'your PawOS Pro trial ends in 2 days.',
        manageUrl: 'https://revantaai.com/account/subscription',
        ...b,
      }),
  },
  subscriptionPurchased: {
    label: 'Subscription — Purchased',
    build: (b) =>
      React.createElement(SubscriptionEvent, {
        name: 'Alex',
        variant: 'purchased',
        planName: 'Pro',
        detailText: 'your PawOS Pro subscription is now active.',
        manageUrl: 'https://revantaai.com/account/subscription',
        ...b,
      }),
  },
  subscriptionRenewed: {
    label: 'Subscription — Renewed',
    build: (b) =>
      React.createElement(SubscriptionEvent, {
        name: 'Alex',
        variant: 'renewed',
        planName: 'Pro',
        detailText: 'your PawOS Pro subscription renewed successfully.',
        manageUrl: 'https://revantaai.com/account/subscription',
        ...b,
      }),
  },
  subscriptionCancelled: {
    label: 'Subscription — Cancelled',
    build: (b) =>
      React.createElement(SubscriptionEvent, {
        name: 'Alex',
        variant: 'cancelled',
        planName: 'Pro',
        detailText: "your PawOS Pro subscription has been cancelled and won't renew.",
        manageUrl: 'https://revantaai.com/account/subscription',
        ...b,
      }),
  },
  paymentSuccess: {
    label: 'Payment Success',
    build: (b) => React.createElement(PaymentSuccess, { name: 'Alex', amount: '$12.00', planName: 'Pro', invoiceUrl: 'https://revantaai.com/invoices/demo', ...b }),
  },
  paymentFailed: {
    label: 'Payment Failed',
    build: (b) =>
      React.createElement(PaymentFailed, { name: 'Alex', amount: '$12.00', planName: 'Pro', updatePaymentUrl: 'https://revantaai.com/account/billing', ...b }),
  },
  invoice: {
    label: 'Invoice',
    build: (b) =>
      React.createElement(Invoice, {
        invoiceNumber: 'INV-1042',
        customerName: 'Alex',
        amount: '$12.00',
        tax: '$0.00',
        date: NOW,
        paymentMethod: 'Visa •••• 4242',
        downloadUrl: 'https://revantaai.com/invoices/demo.pdf',
        ...b,
      }),
  },
  refund: { label: 'Refund', build: (b) => React.createElement(Refund, { name: 'Alex', amount: '$12.00', reason: 'Subscription cancelled early', ...b }) },
  tokenPurchase: { label: 'Token Purchase', build: (b) => React.createElement(TokenPurchase, { name: 'Alex', tokenAmount: '5,000', newBalance: '12,500', ...b }) },
  companionCreated: {
    label: 'Companion Created',
    build: (b) => React.createElement(CompanionCreated, { name: 'Alex', companionName: 'Nova', openUrl: 'https://revantaai.com', ...b }),
  },
  companionUpdated: {
    label: 'Companion Updated',
    build: (b) => React.createElement(CompanionUpdated, { name: 'Alex', companionName: 'Nova', changeSummary: 'New voice and personality tuning applied.', ...b }),
  },
  memoryBackupComplete: {
    label: 'Memory Backup Complete',
    build: (b) => React.createElement(MemoryBackupComplete, { name: 'Alex', whenText: NOW, itemCount: 128, ...b }),
  },
  weeklySummary: {
    label: 'Weekly Summary',
    build: (b) =>
      React.createElement(PeriodSummary, {
        name: 'Alex',
        period: 'weekly',
        stats: [
          { label: 'Conversations', value: '14' },
          { label: 'Tasks completed', value: '9' },
          { label: 'Tokens used', value: '2,340' },
        ],
        ...b,
      }),
  },
  monthlySummary: {
    label: 'Monthly Summary',
    build: (b) =>
      React.createElement(PeriodSummary, {
        name: 'Alex',
        period: 'monthly',
        stats: [
          { label: 'Conversations', value: '61' },
          { label: 'Tasks completed', value: '38' },
          { label: 'Tokens used', value: '9,870' },
        ],
        ...b,
      }),
  },
  productUpdate: {
    label: 'Product Update',
    build: (b) =>
      React.createElement(ProductUpdate, {
        variant: 'update',
        title: 'Faster startup, smoother animations',
        body: 'This release cuts cold-start time in half and smooths out companion locomotion.',
        learnMoreUrl: 'https://revantaai.com/changelog',
        ...b,
      }),
  },
  productNewFeature: {
    label: 'Product — New Feature',
    build: (b) =>
      React.createElement(ProductUpdate, {
        variant: 'newFeature',
        title: 'Introducing Companion Lab',
        body: 'Design a fully custom companion from scratch, or start from a template.',
        learnMoreUrl: 'https://revantaai.com/changelog',
        ...b,
      }),
  },
  productReleaseNotes: {
    label: 'Product — Release Notes',
    build: (b) =>
      React.createElement(ProductUpdate, {
        variant: 'releaseNotes',
        title: 'PawOS 0.2.0 release notes',
        body: 'Auth via Supabase, Google sign-in, and a full email notification system.',
        learnMoreUrl: 'https://revantaai.com/changelog',
        ...b,
      }),
  },
  newsletter: {
    label: 'Newsletter',
    build: (b) =>
      React.createElement(Newsletter, {
        headline: "What's new this month at PawOS",
        intro: 'A quick roundup of what shipped and what to expect next.',
        sections: [
          { title: 'Companion Lab', body: 'Build a fully custom companion, no templates required.' },
          { title: 'Faster animations', body: 'Locomotion and idle behaviors are noticeably smoother.' },
        ],
        ctaLabel: 'Read the full changelog',
        ctaUrl: 'https://revantaai.com/changelog',
        unsubscribeUrl: 'https://revantaai.com/unsubscribe?demo=1',
        ...b,
      }),
  },
};

let cachedBranding: BrandingProps | null = null;

function toDataUri(filePath: string): string {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function getPreviewBranding(): BrandingProps {
  if (!cachedBranding) {
    const brandingDir = getBrandingDir();
    cachedBranding = {
      logoFullSrc: toDataUri(path.join(brandingDir, 'logo-full.png')),
      logoIconSrc: toDataUri(path.join(brandingDir, 'logo-icon.png')),
    };
  }
  return cachedBranding;
}

export function listMailTemplates(): { key: string; label: string }[] {
  return Object.entries(TEMPLATES).map(([key, entry]) => ({ key, label: entry.label }));
}

export async function renderMailPreview(key: string): Promise<string> {
  const entry = TEMPLATES[key];
  if (!entry) throw new Error(`Unknown mail template: ${key}`);
  return render(entry.build(getPreviewBranding()));
}
