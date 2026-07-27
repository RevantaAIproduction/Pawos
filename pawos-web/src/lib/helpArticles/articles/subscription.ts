import type { HelpArticle } from '../HelpArticleTypes';

export const SUBSCRIPTION_ARTICLES: HelpArticle[] = [
  {
    id: 'paw-go',
    category: 'subscription',
    title: 'Paw Go',
    summary: 'PawOS’s real, genuinely free tier — no AI models, no AI credits, by design.',
    overview:
      'Paw Go is PawOS’s free tier. It is a real, deliberate product decision, not a limited trial: Go has ' +
      'zero AI models available and a monthly AI credit limit of exactly 0. Everything non-AI — companion ' +
      'visuals, Projects, git tooling, and basic workspace features — works fully on Go.',
    features: [
      'Companion Studio and desktop companion visuals',
      'Basic workspace and file management',
      'Local runtime features (Projects, git, history)',
      'No AI models, no AI reasoning, no AI credits',
    ],
    howItWorks: 'Go is the default, unauthenticated-friendly tier. It is not gated behind a trial countdown — it stays free indefinitely, with the tradeoff that AI-powered features (voice conversations, AI coding assistance) are unavailable until you upgrade.',
    bestPractices: ['Use Go if you want PawOS purely as a companion-visual and project/git tool without AI', 'Upgrade to Pro when you want voice conversations or AI coding help'],
    examples: [],
    troubleshooting: ['If AI features are unavailable, this is expected on Go — upgrade to unlock AI models'],
    requirements: [],
    permissions: [],
    administration: 'Go has no organization/seat concept — it is an individual, single-account tier.',
    billing: 'Free — $0. No payment method required.',
    faq: [
      { question: 'Is Paw Go a trial?', answer: 'No — it is a genuinely free, ongoing tier with zero AI models by design, not a time-limited trial.' },
      { question: 'Who is Paw Go for?', answer: 'Anyone who wants the companion and project/git tooling without needing AI-powered conversation or coding assistance.' },
    ],
    relatedArticleIds: ['paw-pro', 'account-usage'],
    relatedSettings: ['Billing'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['paw go', 'free tier', 'subscription'],
    aliases: ['Paw Go', 'Free plan'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'paw-pro',
    category: 'subscription',
    title: 'Paw Pro',
    summary: 'Full AI models and advanced runtimes for individual use.',
    overview:
      'Paw Pro unlocks the full real AI model roster (paw-flash, paw-swift, paw-core, paw-creative, paw-vision, ' +
      'paw-voice, paw-motion, paw-memory) and advanced runtimes — AI voice conversation, AI coding assistance ' +
      'in Paw Pro coding mode, and everything included in Go.',
    features: ['Everything in Paw Go', 'Full AI model access', 'Advanced runtimes (AI coding, voice conversations)'],
    howItWorks: 'Upgrading to Pro immediately unlocks AI models and advanced runtimes through the EntitlementService — no separate configuration is needed beyond having an AI provider set up.',
    bestPractices: ['Set up an AI provider/API key in Settings right after upgrading to start using AI features immediately'],
    examples: [],
    troubleshooting: [],
    requirements: ['A configured AI provider/API key to actually use unlocked AI features'],
    permissions: [],
    administration: 'Individual tier — no organization/seat concept.',
    billing: 'Currently uncapped monthly AI credit limit (pricing/limits marked "Business Configuration Required" until finalized).',
    faq: [
      { question: 'What AI models does Pro unlock?', answer: 'The full roster: paw-flash, paw-swift, paw-core, paw-creative, paw-vision, paw-voice, paw-motion, and paw-memory.' },
      { question: 'Is there a credit limit on Pro?', answer: 'Pro is currently uncapped while specific limits are being finalized.' },
    ],
    relatedArticleIds: ['paw-go', 'paw-pro-max', 'analytics-ai-usage'],
    relatedSettings: ['Billing', 'Usage'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['paw pro', 'subscription', 'ai models'],
    aliases: ['Paw Pro'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'paw-pro-max',
    category: 'subscription',
    title: 'Paw Pro Max',
    summary: 'Pro’s full feature set for individuals who want the highest tier without an organization.',
    overview:
      'Paw Pro Max includes everything in Pro. It is the individual tier positioned above Pro for users who ' +
      'want the strongest available individual plan, without needing Team/Enterprise organization features.',
    features: ['Everything in Paw Pro', 'The individual tier positioned closest to Team/Enterprise capability without organization features'],
    howItWorks: 'Pro Max shares the same full AI model roster and advanced runtimes as Pro — the distinction today is pricing tier positioning, since organization features only begin at Team.',
    bestPractices: ['Choose Pro Max over Pro if you specifically want the higher individual tier; choose Team/Enterprise instead if you need multiple people in one organization'],
    examples: [],
    troubleshooting: [],
    requirements: ['A configured AI provider/API key'],
    permissions: [],
    administration: 'Individual tier — no organization/seat concept.',
    billing: 'Currently uncapped monthly AI credit limit (pricing marked "Business Configuration Required" until finalized).',
    faq: [{ question: 'What’s different between Pro and Pro Max?', answer: 'They share the same model roster and features today; Pro Max is the higher individual pricing tier. Organization capability begins at Team, not Pro Max.' }],
    relatedArticleIds: ['paw-pro', 'paw-team'],
    relatedSettings: ['Billing'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['paw pro max', 'subscription'],
    aliases: ['Paw Pro Max'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'team',
    category: 'subscription',
    title: 'Paw Team',
    summary: 'Real, seat-based organizations for small teams — shared workspace, roles, and billing.',
    overview:
      'Paw Team is for small teams who want to share workspace context under one organization. Every Team ' +
      'account can create a real Organization — a Supabase-backed record with a human-readable ID like ' +
      '`ORG-RVT-001` — and invite members with specific roles. Team is billed per seat.',
    features: [
      'Create a real Organization with a human-readable ID',
      'Invite members by email with a role',
      'Shared organization visibility for billing and members',
      'Seat-based billing (roughly 2–150 seats)',
      'Full AI model roster for every member',
    ],
    howItWorks:
      'Once on Team, open Settings → Organization to create your organization. Invite teammates by email, ' +
      'assigning each a role. Today, General (org name/ID/tier) and Members (invite/change role/remove) are ' +
      'fully working; Roles, Billing, Workspace, Security, Audit, and Integrations sub-areas are visibly ' +
      'reserved with a "coming with full workspace rollout" state — present in the UI so it’s clear where the ' +
      'product is headed, but not yet fully built out.',
    bestPractices: [
      'Assign a billing administrator early so billing responsibilities aren’t left solely with the org owner',
      'Invite members with the least-privileged role that fits their actual responsibilities',
    ],
    examples: [
      { title: 'Setting up a new Team organization', steps: ['Upgrade to Paw Team', 'Open Settings → Organization', 'Create your organization (name it)', 'Invite a billing administrator', 'Invite remaining members with appropriate roles', 'Review your org’s usage in Analytics'] },
    ],
    troubleshooting: ['If the Organization tab is missing, confirm your account is actually on Team or Enterprise, not Pro/Pro Max', 'If an invite email never arrives, the invite record is still created — check the Members list directly'],
    requirements: ['A real (non-Guest) account on the Team tier'],
    permissions: ['Only owner/billing-administrator/workspace-administrator roles can manage members and billing, depending on the action'],
    administration:
      'Team roles are customer organization roles, separate from PawOS’s own internal platform administrators: ' +
      'owner (full control, including billing and members), billingAdministrator (manages billing), ' +
      'workspaceAdministrator (manages workspaces/projects), and member (standard access). A Team owner can ' +
      'invite/remove their own employees and manage their own org’s billing, but cannot see other organizations ' +
      'or access PawOS’s internal platform administration.',
    billing: 'Seat-based, roughly 2–150 seats. Per-seat pricing is currently "Business Configuration Required" (not yet finalized).',
    faq: [
      { question: 'Who can invite new members?', answer: 'The organization owner and, depending on the action, a billing or workspace administrator.' },
      { question: 'Is Team roles/billing/security fully built?', answer: 'General and Members are real and working today; Roles, Billing, Workspace, Security, Audit, and Integrations are visibly reserved for a future full workspace rollout.' },
      { question: 'Can a Team organization see other organizations?', answer: 'No — organization data is protected so only your own organization’s members can see it.' },
    ],
    relatedArticleIds: ['paw-pro-max', 'enterprise', 'account-usage'],
    relatedSettings: ['Organization', 'Billing'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['paw team', 'organization', 'team plan', 'invite members', 'seats'],
    aliases: ['Paw Team', 'Organization', 'Team plan', 'Invite members'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 5,
  },
  {
    id: 'enterprise',
    category: 'subscription',
    title: 'Paw Enterprise',
    summary: 'The same real organization system as Team, extended with more granular enterprise roles.',
    overview:
      'Paw Enterprise builds on the same real Organization/Membership system as Team, with a broader set of ' +
      'roles suited to larger organizations. It is billed per seat with a higher starting seat count and no ' +
      'upper bound. Enterprise roles are customer organization roles — entirely separate from PawOS’s own ' +
      'internal platform administrators (the small number of Revanta AI staff who operate PawOS itself).',
    features: [
      'The same real Organization/Membership system as Team, with more roles',
      'Seat-based billing starting around 20 seats with no upper bound',
      'Full AI model roster for every member',
    ],
    howItWorks:
      'Enterprise accounts create an organization the same way Team does (Settings → Organization), but choose ' +
      'from a broader role set. As with Team, General and Members are fully working today; deeper enterprise ' +
      'concepts described below — multiple departments, organization-wide policies, centralized security/' +
      'privacy administration, dedicated deployment/migration support — are clearly future roadmap items, not ' +
      'available yet, and are not presented as active features.',
    bestPractices: ['Assign IT and Security administrator roles separately from the org owner as your organization grows', 'Treat department-level structure as a roadmap item, not something to depend on today'],
    examples: [
      { title: 'Setting up an Enterprise organization', steps: ['Upgrade to Paw Enterprise', 'Open Settings → Organization', 'Create your organization', 'Invite an organization administrator and a billing administrator', 'Invite remaining members with appropriate roles'] },
    ],
    troubleshooting: ['If department-based management is missing, that is expected — it is a roadmap item, not a current feature'],
    requirements: ['A real (non-Guest) account on the Enterprise tier'],
    permissions: ['Role-gated management, same mechanism as Team but with a broader role set'],
    administration:
      'Enterprise roles are customer organization roles (separate from PawOS platform administrators): ' +
      'organizationOwner, organizationAdministrator, itAdministrator, securityAdministrator, ' +
      'billingAdministrator, departmentManager, and member. These map to real, working General/Members ' +
      'organization functionality today. Multiple departments/workspaces, organization-wide policies, ' +
      'centralized security/privacy/analytics administration, and dedicated deployment/migration support are ' +
      'explicitly roadmap items — not yet built — and are marked as such rather than presented as available.',
    billing: 'Seat-based, starting around 20 seats with no upper bound. Centralized invoicing and per-seat pricing are currently "Business Configuration Required" (not yet finalized).',
    faq: [
      { question: 'Does Enterprise support multiple departments today?', answer: 'Not yet — department structure and organization-wide policy management are roadmap items, not current features.' },
      { question: 'Is Enterprise the same underlying system as Team?', answer: 'Yes — the same real Organization/Membership/Role system, extended with a broader enterprise role set.' },
      { question: 'Are Enterprise administrators the same as PawOS’s own admins?', answer: 'No — Enterprise roles are your own organization’s customer administrators, entirely separate from PawOS’s internal platform administrators.' },
    ],
    relatedArticleIds: ['team', 'security', 'privacy'],
    relatedSettings: ['Organization', 'Billing', 'Security'],
    relatedApps: ['upgrade', 'settings'],
    keywords: ['paw enterprise', 'enterprise plan', 'organization administrator', 'it administrator', 'security administrator', 'department manager'],
    aliases: ['Paw Enterprise', 'Enterprise plan', 'Organization Owner', 'IT Administrator'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 6,
  },
];
