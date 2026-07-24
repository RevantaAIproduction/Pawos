import type { HelpArticle } from '../HelpArticleTypes';

export const COMMUNICATION_ARTICLES: HelpArticle[] = [
  {
    id: 'communication-email',
    category: 'communication',
    title: 'Email',
    summary: 'Drafting real follow-up emails from your meetings and conversations.',
    overview:
      'PawOS does not provide a general inbox or Gmail/Outlook integration. What it does provide is real ' +
      'follow-up email drafting: after a captured meeting or conversation, PawOS can draft a follow-up email ' +
      'grounded in the actual transcript and decisions, which you review and edit before it’s sent through your ' +
      'own configured email account. Nothing is ever auto-sent.',
    features: [
      'Follow-up email drafts grounded in a real captured conversation/meeting',
      'Draft → preview → edit → send flow, always requiring your review',
      'Real SMTP sending through your own configured email account',
    ],
    howItWorks:
      'After a meeting or conversation is captured and analyzed, PawOS can generate a draft follow-up email ' +
      'referencing real decisions and action items from that session. You review and edit it in a compose view, ' +
      'then choose to send — PawOS never sends on its own.',
    bestPractices: ['Always review a drafted follow-up before sending — it is a starting point, not a final message'],
    examples: [
      { title: 'Sending a follow-up after a meeting', steps: ['Capture or review a meeting session', 'Ask PawOS to draft a follow-up email', 'Review and edit the draft', 'Send it through your configured email account'] },
    ],
    troubleshooting: ['If sending fails, check your SMTP email account configuration in Settings'],
    requirements: ['A configured email account for sending (SMTP; Gmail/Outlook are not fully wired connectors today)'],
    permissions: ['A draft is never sent without your explicit action'],
    relatedArticleIds: ['meetings', 'draft-replies'],
    relatedSettings: ['Notifications'],
    relatedApps: ['communicationDrafts'],
    faq: [{ question: 'Does PawOS read my email inbox?', answer: 'No — there is no general inbox integration. Email functionality is limited to drafting follow-ups from captured conversations, sent through your own account.' }],
    keywords: ['email', 'follow-up email', 'draft email', 'smtp'],
    aliases: ['Email', 'Follow-up email', 'Compose'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'communication-calendar',
    category: 'communication',
    title: 'Calendar',
    summary: 'The current state of calendar support — and why meetings are detected differently.',
    overview:
      'PawOS does not have real calendar sync today — there is no Google Calendar (or other) API connector ' +
      'built yet; that is a deferred roadmap item. Instead, meetings are detected at the desktop level (noticing ' +
      'that a meeting app like Zoom, Meet, Teams, or Webex is running), not by reading your calendar.',
    features: ['Desktop-level meeting detection (not calendar-based)'],
    howItWorks: 'A meeting-detection watcher notices when a recognized meeting application is active and proactively offers to record it, rather than relying on calendar events.',
    bestPractices: ['Do not rely on PawOS for calendar reminders today — use your existing calendar app for that'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['meetings', 'communication-email'],
    relatedSettings: [],
    relatedApps: ['communicationDrafts'],
    faq: [{ question: 'Does PawOS sync with Google Calendar?', answer: 'Not today — real calendar sync is a deferred roadmap item, not a current feature.' }],
    keywords: ['calendar', 'calendar sync', 'meeting detection'],
    aliases: ['Calendar', 'Calendar sync'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
    roadmap: false,
  },
  {
    id: 'meetings',
    category: 'communication',
    title: 'Meetings',
    summary: 'Desktop-first meeting capture, transcription, and intelligence.',
    overview:
      'PawOS captures meetings primarily through your own desktop (screen and audio), rather than depending on ' +
      'joining as a bot participant — with provider-aware handling for Meet, Zoom, Teams, and Webex, honest ' +
      'fallback when a specific provider integration isn’t available, a consent gate before recording, and a ' +
      'real speaker timeline with timestamp-linked evidence.',
    features: [
      'Desktop-first capture (screen + audio), not dependent on joining as a participant',
      'Provider-aware handling for Meet/Zoom/Teams/Webex with honest fallback',
      'Consent gate before any recording begins',
      'Speaker timeline and timestamp-linked decisions/action items',
      'Proactive "record this meeting?" prompt when a meeting is detected',
      'Executive summary, risks, open questions, and next-agenda extraction after the meeting',
    ],
    howItWorks:
      'When a meeting app is detected running, PawOS asks for consent before recording. It captures desktop ' +
      'audio/video, transcribes it, and extracts structured intelligence (decisions, action items, executive ' +
      'summary, risks, open questions) with a timestamped speaker timeline linking every claim back to the real ' +
      'moment it was said.',
    bestPractices: ['Grant consent only for meetings you actually want captured', 'Review the extracted decisions/action items — they are grounded in the transcript but worth a quick check'],
    examples: [
      { title: 'Capturing and reviewing a meeting', steps: ['Start a meeting in Zoom/Meet/Teams/Webex', 'Approve the "record this meeting?" prompt', 'Let the meeting finish', 'Review the executive summary, decisions, and speaker timeline'] },
    ],
    troubleshooting: ['If a meeting wasn’t detected, check that the meeting app is one of the supported providers', 'If recording didn’t start, confirm consent was actually granted'],
    requirements: ['A supported meeting application actively running (Meet, Zoom, Teams, or Webex)'],
    permissions: ['Explicit consent is required before any meeting recording begins'],
    relatedArticleIds: ['communication-calendar', 'draft-replies', 'communication-email'],
    relatedSettings: ['Privacy', 'Notifications'],
    relatedApps: ['communicationDrafts'],
    faq: [
      { question: 'Does PawOS join my meeting as a bot?', answer: 'No — desktop capture (your own screen/audio) is the primary mode, not joining as a participant.' },
      { question: 'Can PawOS record without asking?', answer: 'No — a consent gate always appears before recording starts.' },
    ],
    keywords: ['meetings', 'meeting recording', 'zoom', 'google meet', 'teams', 'webex', 'transcription'],
    aliases: ['Meetings', 'Record meeting', 'Meeting transcript'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'draft-replies',
    category: 'communication',
    title: 'Draft Replies',
    summary: 'The draft-preview-edit-send flow for follow-up emails, linked back to their source conversation.',
    overview:
      'Draft Replies is the same follow-up-email drafting flow described in Email, viewed from the perspective ' +
      'of managing drafts: every draft is linked back to the meeting or conversation it came from, so you can ' +
      'trace a follow-up to exactly what was discussed.',
    features: ['Drafts linked back to their source conversation/meeting', 'Preview and edit before sending', 'Never auto-sent'],
    howItWorks: 'A generated draft carries a reference to the session it came from. Opening it shows both the draft and, if needed, the originating decisions/action items for context before you edit and send.',
    bestPractices: ['Use the linked source conversation to double-check details before sending a draft'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: ['A draft is only sent after your explicit action'],
    relatedArticleIds: ['communication-email', 'meetings'],
    relatedSettings: [],
    relatedApps: ['communicationDrafts'],
    faq: [],
    keywords: ['draft replies', 'draft email', 'follow-up drafts'],
    aliases: ['Draft Replies', 'Drafts'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
