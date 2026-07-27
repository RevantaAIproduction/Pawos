import type { HelpArticle } from '../HelpArticleTypes';

export const CLOUD_ARTICLES: HelpArticle[] = [
  {
    id: 'cloud-google',
    category: 'cloud',
    title: 'Google',
    summary: 'What Google integration really covers today, and what’s still roadmap.',
    overview:
      'Google Sign-In is real — a genuine OAuth flow via Supabase used for authentication. Direct integration ' +
      'with Google Drive, Google Calendar, or Gmail (reading/writing your files, events, or mail through ' +
      'Google’s own APIs) is NOT built yet — that is a deferred roadmap item, not something available today.',
    features: ['Real Google Sign-In (OAuth via Supabase) for authentication'],
    howItWorks: 'Choosing "Continue with Google" on the auth screen runs a real OAuth flow and creates or signs into your PawOS account. It does not grant PawOS access to your Drive, Calendar, or Gmail content.',
    bestPractices: ['Use Google Sign-In for authentication only — do not expect Drive/Calendar/Gmail sync yet'],
    examples: [],
    troubleshooting: ['If Google Sign-In fails, confirm you have an internet connection and are using a valid Google account'],
    requirements: ['An internet connection', 'A Google account for Google Sign-In'],
    permissions: ['Standard OAuth consent for authentication only — no Drive/Calendar/Gmail access is requested'],
    relatedArticleIds: ['google-sign-in', 'cloud-sync'],
    relatedSettings: ['Account'],
    relatedApps: ['settings'],
    faq: [
      { question: 'Can PawOS access my Google Drive files?', answer: 'Not today — Drive integration is a deferred roadmap item, not a shipped feature.' },
      { question: 'Does signing in with Google sync my Google Calendar?', answer: 'No — Google Sign-In is authentication only; calendar sync does not exist yet.' },
    ],
    keywords: ['google', 'google drive', 'google calendar', 'gmail', 'google sign in'],
    aliases: ['Google', 'Continue with Google', 'Google Drive', 'Gmail'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'cloud-sync',
    category: 'cloud',
    title: 'Cloud Sync',
    summary: 'What actually syncs to the cloud today, and what stays purely local.',
    overview:
      'Cloud sync in PawOS today is scoped narrowly and honestly: your Supabase-backed authentication session, ' +
      'and — for real accounts on Team/Enterprise plans — your Organization and membership data. Everything ' +
      'else (settings, conversation history, companion memory, execution/work history) stays local to this ' +
      'device and is not synced across your own multiple installs yet.',
    features: ['Cloud-synced authentication session', 'Cloud-synced Organization/membership data for Team/Enterprise accounts'],
    howItWorks: 'Your account session and (if applicable) organization membership are stored in Supabase, protected by row-level security so only your organization’s own members can see it. Local app data stays as local files on each device.',
    bestPractices: ['Do not expect your settings, history, or companion data to appear on a second device yet — only the account session and org membership sync'],
    examples: [],
    troubleshooting: [],
    requirements: ['An internet connection for cloud-synced data', 'A real account (not Guest) for any cloud sync'],
    permissions: [],
    relatedArticleIds: ['cloud-google', 'offline-mode', 'privacy'],
    relatedSettings: ['Account', 'Privacy'],
    relatedApps: ['settings'],
    faq: [{ question: 'Will my settings sync between my two computers?', answer: 'Not yet — only your account session and (for Team/Enterprise) organization membership sync today; other local data does not.' }],
    keywords: ['cloud sync', 'sync', 'supabase', 'organization sync'],
    aliases: ['Cloud Sync'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'offline-mode',
    category: 'cloud',
    title: 'Offline Mode',
    summary: 'What still works when you have no internet connection.',
    overview:
      'PawOS fully functions offline for everything that doesn’t inherently need the internet: local companion ' +
      'interaction (outside of AI reasoning/voice, which need a configured provider), project and file work, ' +
      'git operations, and anything you’ve previously viewed. What genuinely requires a connection is AI ' +
      'reasoning/voice (needs a configured provider), cloud authentication, and Organization/Team features.',
    features: ['Full local project/git/file functionality with no connection', 'Companion visuals and idle behaviors work offline'],
    howItWorks: 'PawOS distinguishes local operations (which run entirely on-device) from cloud-dependent ones (auth, AI provider calls, organization data), so losing connectivity only affects the latter.',
    bestPractices: ['If you know you’ll be offline, sign in and set up your AI provider beforehand — reasoning/voice features need connectivity when actually invoked'],
    examples: [],
    troubleshooting: ['If AI conversations stop responding, check your connection — reasoning/voice genuinely require it'],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['cloud-sync', 'cloud-google'],
    relatedSettings: [],
    relatedApps: ['settings'],
    faq: [{ question: 'Can I use PawOS with no internet at all?', answer: 'Yes, for local project/git/file work and basic companion visuals. AI reasoning/voice and cloud/organization features need a connection.' }],
    keywords: ['offline', 'offline mode', 'no internet'],
    aliases: ['Offline Mode'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
