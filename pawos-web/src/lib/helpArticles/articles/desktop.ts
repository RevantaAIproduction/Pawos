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
      'Graphics — the 3D companion uses your graphics card when available',
      'Storage — local data lives under your OS’s app-data directory as small, separate JSON files per feature area',
      'Settings — the full categorized panel: General, Appearance, Companion, Voice, Notifications, Privacy, Performance, Updates, Advanced, plus Account, Billing, Usage, Devices',
    ],
    howItWorks:
      'Most desktop settings are self-explanatory from their tab. For storage, each feature area (companion, ' +
      'billing, execution history, etc.) writes its own small JSON file rather than one large database, making ' +
      'individual data easy to reason about.',
    bestPractices: ['Check the Updates tab periodically to stay current', 'To reset PawOS’s local data, close the app first, then clear its app-data folder'],
    examples: [],
    troubleshooting: [
      'To reset PawOS’s local state, close the app and clear its app-data folder',
    ],
    requirements: [],
    permissions: [],
    faq: [
      { question: 'How do I reset PawOS?', answer: 'Close PawOS, then clear its app-data folder. Your account isn’t affected — just sign in again.' },
      { question: 'Does the companion use my graphics card?', answer: 'Yes — 3D rendering uses your graphics card when available.' },
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
