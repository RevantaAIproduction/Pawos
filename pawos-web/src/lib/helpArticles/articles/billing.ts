import type { HelpArticle } from '../HelpArticleTypes';

export const BILLING_ARTICLES: HelpArticle[] = [
  {
    id: 'billing',
    category: 'billing',
    title: 'Billing',
    summary: 'Payment methods, invoices, renewals, refunds, taxes, and changing your plan.',
    overview:
      'PawOS payments go through a secure checkout — the desktop app never handles your card details. ' +
      'This article covers every part of billing you’ll actually encounter: how you pay, how invoices and ' +
      'renewals work, how refunds are processed, and how to change your plan.',
    features: [
      'Payment Methods — cards, UPI, net banking and wallets, chosen at checkout',
      'Invoices — generated for each payment, downloadable, and emailed to you automatically',
      'Renewals — subscriptions auto-renew at the end of each billing period unless you cancel first',
      'Refunds — returned to your original payment method, with a confirmation email once complete',
      'Taxes — calculated and applied at checkout',
      'Subscription Changes — upgrade or downgrade your plan anytime from the Upgrade page',
    ],
    howItWorks:
      'When you choose a paid plan, you complete a secure checkout. A successful payment sends you a ' +
      'confirmation email and an invoice; a failed payment sends an email asking you to update your payment ' +
      'method. Canceling stops future renewal; changing plan takes effect through the same checkout.',
    bestPractices: ['Keep your payment method up to date to avoid a failed renewal', 'Download and keep invoices for your own records — they are also emailed automatically'],
    examples: [
      { title: 'Upgrading your plan', steps: ['Open the Upgrade page', 'Choose the new plan', 'Complete checkout', 'Receive a confirmation email and invoice'] },
      { title: 'Requesting a refund', steps: ['Contact support with your billing concern', 'Once approved, the refund is sent to your original payment method', 'You receive a refund confirmation email'] },
    ],
    troubleshooting: [
      'If a payment fails, check the payment-failed email for the reason and update your payment method',
      'If an invoice email never arrives, check your spam folder — the same invoice is in your billing history',
    ],
    requirements: ['A card, UPI, net banking or wallet payment method for any paid plan'],
    permissions: [],
    administration: 'On Team/Enterprise, a billing administrator can manage billing on the organization’s behalf, separate from the organization owner.',
    billing: 'All payments, invoices, renewals, refunds and taxes are handled through PawOS’s secure checkout.',
    faq: [
      { question: 'How do I pay?', answer: 'Through a secure checkout with a card, UPI, net banking or a wallet.' },
      { question: 'Do subscriptions auto-renew?', answer: 'Yes, at the end of each billing period, unless you cancel first.' },
      { question: 'How do refunds work?', answer: 'Approved refunds go back to your original payment method, and you get a confirmation email.' },
      { question: 'Can I change my plan anytime?', answer: 'Yes — upgrade or downgrade anytime from the Upgrade page.' },
    ],
    relatedArticleIds: ['paw-pro', 'team', 'enterprise'],
    relatedSettings: ['Billing'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['billing', 'payment methods', 'invoices', 'renewals', 'refunds', 'upi', 'taxes', 'subscription changes'],
    aliases: ['Billing', 'Invoices', 'Payments', 'Refund', 'Change plan'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
];
