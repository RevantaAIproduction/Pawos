import type { HelpArticle } from '../HelpArticleTypes';

export const SECURITY_ARTICLES: HelpArticle[] = [
  {
    id: 'security',
    category: 'security',
    title: 'Security',
    summary: 'Permissions, authentication, safe commands, and how PawOS keeps AI actions from being risky.',
    overview:
      'Security in PawOS centers on one principle: nothing consequential happens without your explicit ' +
      'confirmation. This article covers permissions, authentication, companion permissions, safe commands, ' +
      'file protection, system protection, and AI safety.',
    features: [
      'Permissions — every potentially destructive action (deleting a file, running a terminal command, git commit, overwriting a file) requires explicit confirmation before it executes',
      'Authentication — Google OAuth, email/password with real hashing, Supabase-backed sessions, and OTP-based password reset',
      'Companion Permissions — the companion can only act through the same gated execution engine, never bypassing it',
      'Safe Commands — an allowlisted set of terminal commands (npm, git, node, python, and similar known-safe tools); arbitrary or unknown commands are not silently permitted',
      'File Protection — overwriting an existing file always requires explicit confirmation first',
      'System Protection — a local Paw Go vs Paw Pro coding-mode gate exists specifically so read-only/planning use never accidentally triggers real file writes, commands, or builds',
      'AI Safety — the AI reasoning layer is never given your API keys/secrets directly, and never auto-sends emails or commits changes without your review',
    ],
    howItWorks:
      'Every action request — whether from a conversation, the Coding Canvas, or a background task — passes ' +
      'through the same gated execution engine. Destructive or consequential actions describe what they intend ' +
      'to do and wait for your confirmation before running.',
    bestPractices: ['Read what a confirmation prompt says before approving it, especially for commits, checkouts, or overwrites', 'Use Paw Go mode when you want zero risk of file changes'],
    examples: [],
    troubleshooting: ['If an action seems stuck, check for a pending confirmation prompt rather than assuming it failed or crashed'],
    requirements: [],
    permissions: ['Confirmation is required before any destructive or consequential action'],
    administration: 'On Team/Enterprise, a securityAdministrator/itAdministrator role exists conceptually for organization-level security oversight — deeper organization-wide security policy enforcement beyond individual confirmation gates is a roadmap item, not built yet.',
    faq: [
      { question: 'Can the AI commit code or delete files without asking?', answer: 'No — commit, checkout, delete, and overwrite always require your explicit confirmation first.' },
      { question: 'What commands can PawOS run in a terminal?', answer: 'Only an allowlisted set of known-safe tools (npm, git, node, python, and similar) — arbitrary commands are not silently permitted.' },
      { question: 'Does the AI ever see my API keys?', answer: 'No — the reasoning layer is never given your API keys/secrets directly.' },
    ],
    relatedArticleIds: ['companion-permissions', 'account-security', 'privacy'],
    relatedSettings: ['Security', 'Privacy'],
    relatedApps: ['settings', 'development'],
    keywords: ['security', 'permissions', 'authentication', 'safe commands', 'file protection', 'system protection', 'ai safety'],
    aliases: ['Security', 'Safe Commands', 'AI Safety'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
];
