import type { HelpArticle } from '../HelpArticleTypes';

export const DESKTOP_ARTICLES: HelpArticle[] = [
  {
    id: 'desktop',
    category: 'desktop',
    title: 'Desktop',
    summary: 'Updates, performance, GPU use, storage, settings, logs, and resetting PawOS.',
    overview:
      'This article covers the desktop-app-level concerns: how updates and performance settings work, how the ' +
      '3D companion uses your GPU, where local data is stored, the full Settings layout, the current honest ' +
      'state of logging, and how to reset PawOS today.',
    features: [
      'Updates — a real Updates settings tab showing your current version and checking for updates',
      'Performance — a real Performance settings tab',
      'GPU — the 3D companion is rendered with three.js/WebGL and uses your system GPU when available',
      'Storage — local data lives under your OS’s app-data directory as small, separate JSON files per feature area',
      'Settings — the full categorized panel: General, Appearance, Companion, Voice, Notifications, Privacy, Performance, Updates, Advanced, plus Account, Billing, Usage, Devices',
      'Logs — not yet available as a dedicated in-app viewer for end users',
      'Reset PawOS — no one-click in-app reset exists today',
    ],
    howItWorks:
      'Most desktop settings are self-explanatory from their tab. For storage, each feature area (companion, ' +
      'billing, execution history, etc.) writes its own small JSON file rather than one large database, making ' +
      'individual data easy to reason about.',
    bestPractices: ['Check the Updates tab periodically to stay current', 'If you need to fully reset local state today, close PawOS first before touching any files manually'],
    examples: [],
    troubleshooting: [
      'There is currently no dedicated in-app log viewer for end users — this is an honest gap, not a hidden feature',
      'There is currently no one-click "Reset PawOS" button — the real way to reset local state today is to close the app and clear its local app-data folder manually',
    ],
    requirements: [],
    permissions: [],
    faq: [
      { question: 'Can I view app logs from inside PawOS?', answer: 'Not yet — there is no dedicated in-app log viewer for end users today.' },
      { question: 'Is there a "Reset PawOS" button?', answer: 'Not yet — resetting today means manually clearing the app’s local app-data folder while PawOS is closed.' },
      { question: 'Does the companion use my GPU?', answer: 'Yes — 3D rendering uses three.js/WebGL and takes advantage of your system GPU when available.' },
    ],
    relatedArticleIds: ['navigation', 'privacy', 'security'],
    relatedSettings: ['Updates', 'Performance', 'General', 'Advanced'],
    relatedApps: ['settings', 'desktop'],
    keywords: ['desktop', 'updates', 'performance', 'gpu', 'storage', 'settings', 'logs', 'reset pawos'],
    aliases: ['Updates', 'Performance', 'Reset PawOS', 'Logs'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
];
