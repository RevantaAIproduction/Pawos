import type { HelpArticle } from '../HelpArticleTypes';

export const MOBILE_ARTICLES: HelpArticle[] = [
  {
    id: 'mobile',
    category: 'mobile',
    title: 'Mobile',
    summary: 'Coming Soon — a dedicated PawOS mobile companion app, building on existing pairing infrastructure.',
    overview:
      'There is no PawOS mobile app today. What already exists is real, generic device-pairing infrastructure ' +
      '— QR-code pairing plus a device registry — built with a future mobile companion in mind. This article ' +
      'is marked Coming Soon and will be replaced with real mobile documentation once a mobile app ships.',
    features: ['Existing QR-code pairing and device registry infrastructure, ready for a future mobile app'],
    howItWorks: 'Today, Devices (Settings → Devices) lets you generate a pairing QR code and register a device against your account. A dedicated mobile companion app to scan and use that pairing does not exist yet.',
    bestPractices: [],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    faq: [
      { question: 'Is there a PawOS mobile app?', answer: 'Not yet — this is a Coming Soon roadmap item. The underlying device-pairing infrastructure already exists and is ready for it.' },
      { question: 'Can I pair a device today?', answer: 'Yes — the pairing infrastructure (QR code + device registry) is real, from Settings → Devices, even though the mobile companion app itself isn’t built yet.' },
    ],
    relatedArticleIds: ['devices'],
    relatedSettings: ['Devices'],
    relatedApps: ['settings'],
    keywords: ['mobile', 'mobile app', 'qr pairing', 'coming soon'],
    aliases: ['Mobile', 'Coming Soon'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 1,
    roadmap: true,
  },
];
