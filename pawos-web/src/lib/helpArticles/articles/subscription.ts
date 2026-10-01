import type { HelpArticle } from '../HelpArticleTypes';

export const SUBSCRIPTION_ARTICLES: HelpArticle[] = [
  {
    id: 'paw-go',
    category: 'subscription',
    title: 'Paw Go',
    summary: 'PawOS’s real, genuinely free tier — real AI for planning, analysis & investigation; execution requires Paw Pro.',
    overview:
      'Paw Go is PawOS’s free tier. It is a real, deliberate product decision, not a limited trial: Go includes ' +
      'real AI (Paw Flash) for investigation, analysis, and planning, drawing from a capped monthly AI credit ' +
      'allowance — but it never executes anything on your behalf. Generating or modifying code, running ' +
      'commands, and deploying always require Paw Pro. Everything non-AI — companion visuals, Projects, git ' +
      'tooling, and basic workspace features — also works fully on Go.',
    features: [
      'Companion Studio and desktop companion visuals',
      'Basic workspace and file management',
      'Local runtime features (Projects, git, history)',
      'Real AI for planning, analysis & investigation (Paw Flash), with a capped credit allowance',
    ],
    howItWorks: 'Go is the default, unauthenticated-friendly tier. It is not gated behind a trial countdown — it stays free indefinitely. Go can investigate, analyze, and plan with real AI; upgrading to Pro is what unlocks execution — generating and modifying code, running commands, deploying, and voice conversations.',
    bestPractices: ['Use Go if you want PawOS as a companion-visual and project/git tool with AI-assisted planning and analysis, but no execution', 'Upgrade to Pro when you want Paw to actually generate/modify code, run commands, deploy, or hold voice conversations'],
    examples: [],
    troubleshooting: ['If an execution action (writing code, running commands, deploying) is refused, this is expected on Go — upgrade to Pro to unlock execution'],
    requirements: [],
    permissions: [],
    administration: 'Go has no organization/seat concept — it is an individual, single-account tier.',
    billing: 'Free — $0. No payment method required. AI usage on Go draws from a free usage allowance.',
    faq: [
      { question: 'Is Paw Go a trial?', answer: 'No — it is a genuinely free, ongoing tier with real AI for planning and analysis by design, not a time-limited trial.' },
      { question: 'Who is Paw Go for?', answer: 'Anyone who wants the companion, project/git tooling, and AI-assisted planning/analysis without needing Paw to execute changes on their behalf.' },
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
      'Paw Pro unlocks the full AI model roster (Paw Flash, Swift, Core, Vision, Voice and Memory — plus Paw Fable ' +
      'with purchased usage credits) and advanced runtimes: voice conversations, AI coding that makes real ' +
      'changes, and everything included in Go.',
    features: ['Everything in Paw Go', 'Full AI model access', 'Advanced runtimes (AI coding, voice conversations)'],
    howItWorks: 'Upgrading to Pro immediately unlocks the AI models and advanced runtimes — nothing else to set up.',
    bestPractices: ['Watch your Paw Compute usage in Settings → Usage to see how much of your allowance you have left'],
    examples: [],
    troubleshooting: [],
    requirements: ['A PawOS account on Paw Pro'],
    permissions: [],
    administration: 'Individual tier — no organization/seat concept.',
    billing: '$20/month, with 2,000 PC (Paw Compute) per billing period and a weekly limit of 1,000 PC. Included plan PC does not carry over. Credits ($1 = 100 PC, never expire) are available if you need more.',
    faq: [
      { question: 'What AI models does Pro unlock?', answer: 'Paw Flash, Swift, Core, Vision, Voice and Memory — plus Paw Fable with purchased usage credits.' },
      { question: 'Is there a usage limit on Pro?', answer: 'Yes — Pro includes 2,000 PC per billing period, with a weekly limit of 1,000 PC. Pro Max 5x includes 10,000 PC and Pro Max 20x includes 25,000 PC.' },
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
    summary: 'Everything in Pro with more Paw Compute: 10,000 PC or 25,000 PC included.',
    overview:
      'Paw Pro Max includes everything in Pro with more Paw Compute: Pro Max 5x includes 10,000 PC per billing ' +
      'period for $100/month, and Pro Max 20x includes 25,000 PC per billing period for $250/month.',
    features: ['Everything in Paw Pro', '10,000 PC included ($100/month) or 25,000 PC included ($250/month)', 'Priority access to new Paw models'],
    howItWorks: 'Pro Max has the same AI models and runtimes as Pro, with a much larger Paw Compute allowance. Organization features begin at Team.',
    bestPractices: ['Choose Pro Max over Pro if you specifically want the higher individual tier; choose Team/Enterprise instead if you need multiple people in one organization'],
    examples: [],
    troubleshooting: [],
    requirements: ['A PawOS account on Paw Pro Max'],
    permissions: [],
    administration: 'Individual tier — no organization/seat concept.',
    billing: '$100/month for Pro Max 5x (10,000 PC per billing period, weekly limit 5,000 PC), or $250/month for Pro Max 20x (25,000 PC per billing period, weekly limit 12,500 PC). Credits: $1 = 100 PC.',
    faq: [{ question: 'What’s different between Pro and Pro Max?', answer: 'The same models and features, with more Paw Compute: 10,000 PC (Pro Max 5x) or 25,000 PC (Pro Max 20x) per billing period, versus 2,000 PC on Pro. Organization features begin at Team.' }],
    relatedArticleIds: ['paw-pro', 'team'],
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
    summary: 'Seat-based organizations for small teams — shared workspaces, roles and billing.',
    overview:
      'Paw Team is for teams who work together under one organization. Create an organization with a ' +
      'readable ID like `ORG-RVT-001`, invite members with specific roles, and share workspaces, companions ' +
      'and credits. Team is billed per seat: Standard $20/seat/month or Premium $100/seat/month.',
    features: [
      'An organization with a readable ID, members and roles',
      'Shared workspaces, shared companions and a shared credit pool',
      'Task management, AI-assisted PR review and remote assistance',
      'Credential vault, approval queue and audit log',
      '2–150 members; mix Standard and Premium seats freely',
    ],
    howItWorks:
      'Once on Team, open Settings → Organization to create your organization. Invite teammates by email and ' +
      'choose each member’s role and seat type when you invite them.',
    bestPractices: [
      'Assign a billing administrator early so billing responsibilities aren’t left solely with the org owner',
      'Invite members with the least-privileged role that fits their actual responsibilities',
    ],
    examples: [
      { title: 'Setting up a new Team organization', steps: ['Upgrade to Paw Team', 'Open Settings → Organization', 'Create your organization (name it)', 'Invite a billing administrator', 'Invite remaining members with appropriate roles', 'Review your org’s usage in Analytics'] },
    ],
    troubleshooting: ['If the Organization tab is missing, confirm your account is actually on Team or Enterprise, not Pro/Pro Max', 'If an invite email never arrives, the invite record is still created — check the Members list directly'],
    requirements: ['A PawOS account on the Team tier'],
    permissions: ['Only owner/billing-administrator/workspace-administrator roles can manage members and billing, depending on the action'],
    administration:
      'Team roles are customer organization roles, separate from PawOS’s own internal platform administrators: ' +
      'owner (full control, including billing and members), billingAdministrator (manages billing), ' +
      'workspaceAdministrator (manages workspaces/projects), and member (standard access). A Team owner can ' +
      'invite/remove their own employees and manage their own org’s billing, but cannot see other organizations ' +
      'or access PawOS’s internal platform administration.',
    billing: 'Per seat: Standard $20/seat/month, Premium $100/seat/month, for 2–150 members.',
    faq: [
      { question: 'Who can invite new members?', answer: 'The organization owner and, depending on the action, a billing or workspace administrator.' },
      { question: 'What’s the difference between Standard and Premium seats?', answer: 'Both get every Team feature; Premium seats have Pro Max-level usage.' },
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
    summary: 'Everything in Team for larger organizations, with more administrator roles.',
    overview:
      'Paw Enterprise includes everything in Team, with a broader set of roles for larger organizations. It is ' +
      'billed at a uniform $20/seat/month from 20 seats with no upper bound. Enterprise roles are your ' +
      'organization’s own administrators — entirely separate from Revanta AI staff.',
    features: [
      'Everything in Paw Team',
      'IT Administrator, Security Administrator and Department Manager roles',
      'Uniform $20/seat/month, from 20 seats',
      'Autonomous Work billed at pass-through rates',
    ],
    howItWorks:
      'Enterprise accounts create an organization the same way Team does (Settings → Organization) and choose ' +
      'from a broader role set when inviting members.',
    bestPractices: ['Assign IT and Security administrator roles separately from the org owner as your organization grows'],
    examples: [
      { title: 'Setting up an Enterprise organization', steps: ['Upgrade to Paw Enterprise', 'Open Settings → Organization', 'Create your organization', 'Invite an organization administrator and a billing administrator', 'Invite remaining members with appropriate roles'] },
    ],
    troubleshooting: ['If the Organization tab is missing, confirm your account is on Enterprise'],
    requirements: ['A PawOS account on the Enterprise tier'],
    permissions: ['Role-gated management, same mechanism as Team but with a broader role set'],
    administration:
      'Enterprise roles are customer organization roles (separate from PawOS platform administrators): ' +
      'organizationOwner, organizationAdministrator, itAdministrator, securityAdministrator, ' +
      'billingAdministrator, departmentManager, and member.',
    billing: 'Uniform $20/seat/month, from 20 seats with no upper bound. Purchases above ₹50,000 are invoiced.',
    faq: [
      { question: 'How is Enterprise different from Team?', answer: 'Everything in Team, plus more administrator roles, a uniform $20 seat price and pass-through Autonomous Work billing.' },
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
