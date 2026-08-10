import type { HelpArticle } from '../HelpArticleTypes';

export const MOBILE_ARTICLES: HelpArticle[] = [
  {
    id: 'mobile',
    category: 'mobile',
    title: 'Mobile',
    summary: 'Pair your phone with your PawOS account for live presence, push notifications, a conversation preview, and remote approvals — no app install required.',
    overview:
      'PawOS on mobile works through your phone\'s browser, not a native app: pair once from Settings → Devices, ' +
      'and your phone stays connected to your desktop in real time. This is a Paw Pro (or higher) feature — ' +
      'Paw Go and Guest sessions can\'t pair a device yet.',
    features: [
      'QR-code pairing, no app install — opens a page in your phone\'s browser',
      'Live "online now" presence once a device is paired',
      'Push notifications for task completions and other desktop alerts',
      'A live, read-only preview of what you and Paw are saying on the desktop (not two-way chat yet — you can\'t reply from your phone)',
      'Approval Center — when Paw needs a yes/no confirmation for a sensitive action, approve or deny it right from your phone',
    ],
    howItWorks:
      'From Settings → Devices, generate a pairing QR code and scan it with your phone\'s camera — it opens ' +
      'pawos.app in your browser, where signing in completes the pairing. From then on your phone shows live ' +
      'device presence, receives push notifications, shows a preview of the desktop conversation, and can ' +
      'respond to approval requests, all without installing anything.',
    bestPractices: [],
    examples: [],
    troubleshooting: [],
    requirements: ['A Paw Pro (or higher) account', 'A modern mobile browser that supports installable web apps'],
    permissions: [],
    faq: [
      { question: 'Is there a PawOS mobile app to download?', answer: 'No — mobile works through your phone\'s browser at pawos.app. You can add it to your home screen for an app-like experience, but there is nothing to install from an app store.' },
      { question: 'Can I reply to Paw from my phone?', answer: 'Not yet — your phone shows a live preview of the desktop conversation, but replying from the phone is arriving in an upcoming update.' },
      { question: 'Can a Paw Go or Guest account pair a phone?', answer: 'No — mobile pairing requires Paw Pro or higher.' },
    ],
    relatedArticleIds: ['devices'],
    relatedSettings: ['Devices'],
    relatedApps: ['settings'],
    keywords: ['mobile', 'mobile app', 'qr pairing', 'phone', 'pairing', 'approval center', 'push notifications'],
    aliases: ['Mobile', 'Phone Pairing'],
    pawosVersion: '0.1.0',
    updated: '2026-07-31',
    lastReviewed: '2026-07-31',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
