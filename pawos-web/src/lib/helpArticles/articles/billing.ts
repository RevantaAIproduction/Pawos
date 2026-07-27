import type { HelpArticle } from '../HelpArticleTypes';

export const BILLING_ARTICLES: HelpArticle[] = [
  {
    id: 'billing',
    category: 'billing',
    title: 'Billing',
    summary: 'Payment methods, invoices, renewals, refunds, Razorpay, taxes, and changing your plan.',
    overview:
      'PawOS billing runs through Razorpay — the real, single payment provider integration used for checkout. ' +
      'This article covers every part of billing you’ll actually encounter: how you pay, how invoices and ' +
      'renewals work, how refunds are processed, and how to change your plan.',
    features: [
      'Payment Methods — managed entirely through Razorpay’s checkout, supporting the payment methods Razorpay itself offers',
      'Invoices — generated per payment, downloadable, and emailed to you automatically (a real Invoice email template)',
      'Renewals — subscriptions auto-renew at the end of each billing period unless you cancel first',
      'Refunds — processed through Razorpay, with a real confirmation email sent once complete',
      'Razorpay — the real, only payment provider PawOS integrates with today (not Stripe or others)',
      'Taxes — calculated and applied at checkout time by Razorpay; PawOS does not run a separate tax system',
      'Subscription Changes — upgrade or downgrade your tier anytime from the Upgrade page, with Razorpay handling prorated billing',
    ],
    howItWorks:
      'When you choose a paid plan, checkout is handled by Razorpay. Successful payments trigger a real ' +
      'confirmation email and an invoice; failed payments trigger a real payment-failed email prompting you to ' +
      'update your payment method. Canceling stops future renewal; changing tier takes effect through the same ' +
      'Razorpay-managed checkout flow.',
    bestPractices: ['Keep your payment method up to date to avoid a failed renewal', 'Download and keep invoices for your own records — they are also emailed automatically'],
    examples: [
      { title: 'Upgrading your plan', steps: ['Open the Upgrade page', 'Choose the new tier', 'Complete checkout through Razorpay', 'Receive a confirmation email and updated invoice'] },
      { title: 'Requesting a refund', steps: ['Contact support with your billing concern', 'Once approved, Razorpay processes the refund', 'You receive a real refund confirmation email'] },
    ],
    troubleshooting: [
      'If a payment fails, check the payment-failed email for the specific reason and update your payment method',
      'If an invoice email never arrives, check your spam folder — the same invoice is available through your billing history',
    ],
    requirements: ['A payment method supported by Razorpay for any paid tier'],
    permissions: [],
    administration: 'On Team/Enterprise, a billingAdministrator role can manage billing on the organization’s behalf, separate from the org owner.',
    billing: 'All payments, invoices, renewals, refunds, and tax calculation are handled through Razorpay, PawOS’s only payment provider integration.',
    faq: [
      { question: 'What payment provider does PawOS use?', answer: 'Razorpay — the only payment provider integration today.' },
      { question: 'Do subscriptions auto-renew?', answer: 'Yes, at the end of each billing period, unless you cancel first.' },
      { question: 'How do refunds work?', answer: 'Refunds are processed through Razorpay and confirmed with a real email once complete.' },
      { question: 'Can I change my plan anytime?', answer: 'Yes — upgrade or downgrade anytime from the Upgrade page; Razorpay handles prorated billing.' },
    ],
    relatedArticleIds: ['paw-pro', 'team', 'enterprise'],
    relatedSettings: ['Billing'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['billing', 'payment methods', 'invoices', 'renewals', 'refunds', 'razorpay', 'taxes', 'subscription changes'],
    aliases: ['Billing', 'Invoices', 'Razorpay', 'Refund', 'Change plan'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
];
