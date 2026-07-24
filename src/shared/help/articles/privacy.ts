import type { HelpArticle } from '../HelpArticleTypes';

export const PRIVACY_ARTICLES: HelpArticle[] = [
  {
    id: 'privacy',
    category: 'privacy',
    title: 'Privacy',
    summary: 'What stays on your device, what goes to the cloud, and how to delete your account.',
    overview:
      'PawOS keeps the large majority of your data local by design. This article explains exactly what stays ' +
      'on your device, what genuinely goes to the cloud, how it’s protected, how long it’s kept, and how to ' +
      'delete your account.',
    features: [
      'Local Data — settings, conversation history, companion memory, execution/work history, and error memory are all stored as local files on your own device, never uploaded',
      'Cloud Data — only your Supabase authentication session and, for Team/Enterprise accounts, your organization/membership data live in the cloud',
      'Encryption — passwords are hashed, never stored in plaintext; cloud data transport uses standard TLS',
      'Data Retention — local data persists on your device until you delete it or reset the app; there is no automatic cloud retention timer for local-only data since it never leaves your device',
      'Account Deletion — a real, working flow that removes your account and sends a confirmation email',
      'Privacy Policy — the full legal privacy policy is published on the PawOS website, not duplicated inside the desktop app',
    ],
    howItWorks:
      'Local features (companion, projects, git, history) write to files under your OS’s app-data directory and ' +
      'never leave your device. Cloud features (authentication, and Team/Enterprise organization data) are ' +
      'stored in Supabase, protected by row-level security so only you (or your own organization’s members) can ' +
      'read that data.',
    bestPractices: ['Review what’s genuinely local vs. cloud before assuming any feature syncs data you didn’t expect', 'Use account deletion if you want your cloud-side account data removed entirely'],
    examples: [{ title: 'Deleting your account', steps: ['Open Settings → Account', 'Choose to delete your account', 'Confirm the deletion', 'Receive a confirmation email once it’s complete'] }],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    administration: 'On Team/Enterprise, organization data is visible only to that organization’s own members — never to other organizations.',
    faq: [
      { question: 'Is my conversation history uploaded anywhere?', answer: 'No — conversation history, companion memory, and execution history are stored locally on your device only.' },
      { question: 'What exactly goes to the cloud?', answer: 'Only your authentication session, and — if you’re on Team/Enterprise — your organization/membership data.' },
      { question: 'Where is the full legal privacy policy?', answer: 'Published on the PawOS website — it is not duplicated as in-app legal text.' },
      { question: 'Can I delete my account?', answer: 'Yes — a real deletion flow is available from Settings → Account, with a confirmation email once complete.' },
    ],
    relatedArticleIds: ['cloud-sync', 'security', 'account-security'],
    relatedSettings: ['Privacy', 'Account'],
    relatedApps: ['settings'],
    keywords: ['privacy', 'local data', 'cloud data', 'encryption', 'data retention', 'account deletion', 'privacy policy'],
    aliases: ['Privacy', 'Delete account', 'Privacy Policy'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
];
