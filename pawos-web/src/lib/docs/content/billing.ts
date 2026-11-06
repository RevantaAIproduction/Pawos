import type { DocPage } from '../types';

export const billingPages: DocPage[] = [
  {
    section: 'billing',
    slug: 'plans',
    title: 'Plans',
    description: 'Plan capability overview; check your account for current terms.',
    blocks: [
      {
        type: 'table',
        headers: ['Tier', 'Capability', 'Typical use'],
        rows: [
          ['Go', 'Free. Planning and analysis only — no execution.', 'Trying PawOS, read-only project understanding'],
          ['Pro', 'Full execution — file edits, commands, coding, deploys.', 'Individual, everyday use'],
          ['Pro Max', 'Same capabilities as Pro, larger Paw Compute allotment.', 'Heavier individual usage'],
          ['Team', 'Pro/Pro Max capabilities plus shared organization workspaces.', 'Small teams'],
          ['Enterprise', 'Team capabilities plus governance, SSO, audit log, per-seat controls.', 'Larger organizations'],
        ],
      },
      {
        type: 'note',
        text: 'For normal interactive work, Pro and Pro Max use the same execution runtime. Pro Max additionally unlocks Pro Max-gated autonomous-work and project-management capabilities such as autonomousTaskBilling, Jira, and Linear, plus a larger Paw Compute allotment.',
      },
      {
        type: 'table',
        headers: ['Tier', 'Price', 'Paw Compute included'],
        rows: [
          ['Go', 'See current account plan details', 'See current account plan details'],
          ['Pro', 'See current account plan details', 'See current account plan details'],
          ['Pro Max', 'See current account plan details', 'See current account plan details'],
          ['Team', 'See current organization plan details', 'Seat and allowance details vary by account'],
          ['Enterprise', 'See current organization plan details', 'See current organization plan details'],
        ],
      },
      {
        type: 'note',
        text: 'Prices, allowances, tiers and limits can change and may vary by account or region. Use the billing screen as the source of truth before purchasing or upgrading.',
      },
    ],
    related: ['concepts/entitlements', 'billing/upgrades'],
  },
  {
    section: 'billing',
    slug: 'usage',
    title: 'Usage',
    description: 'How PawOS reports what you\'ve used this period.',
    blocks: [
      { type: 'paragraph', text: 'Settings → Usage shows the Paw Compute (PC) you have used and have left: your plan for the current billing period, your weekly limit, and any credits you have bought.' },
      {
        type: 'list',
        items: [
          'Paw Compute is counted by PawOS’s servers, never estimated by the app.',
          'Usage records can’t be edited after the fact.',
          'Your plan’s PC renews with each billing period; unused plan PC does not carry over.',
          'The weekly limit resets every 7 days from the start of your billing period.',
          'Your current plan allowance and reset schedule appear in Settings → Usage.',
        ],
      },
    ],
    related: ['billing/paw-compute', 'billing/limits'],
  },
  {
    section: 'billing',
    slug: 'paw-compute',
    title: 'Paw Compute',
    description: 'The single usage meter every runtime consumes.',
    blocks: [
      {
        type: 'lead',
        text: 'Paw Compute is a single, weighted usage meter — every runtime (Conversation, Coding, Browser, Office, and others) reports through the same pipeline, so you see one number, never a per-feature limit.',
      },
      { type: 'paragraph', text: 'It replaces a flat "one credit per turn" model with a weighted calculation reflecting real backend cost, computed server-side.' },
      {
        type: 'status',
        status: 'implemented',
        text: 'Plan allowances, weekly limits, credit behavior and organization pooling are account-controlled. Check Settings → Usage and your organization billing screen for current values.',
      },
      {
        type: 'warning',
        text: 'PawOS documentation describes Paw Compute as a product-level meter. Users do not need to configure or understand the underlying model-provider billing details.',
      },
    ],
    related: ['billing/plans', 'billing/limits'],
  },
  {
    section: 'billing',
    slug: 'credits',
    title: 'Autonomous Work Credits',
    description: 'The separate dollar wallet that funds Autonomous Ticket completions.',
    blocks: [
      {
        type: 'paragraph',
        text: 'A distinct, dollar-denominated balance from Paw Compute — see Autonomous Work → Autonomous Work Credits for the full detail. It funds only Autonomous Ticket completions, at the volume-tiered rate described in Autonomous Work → Pricing.',
      },
    ],
    related: ['autonomous-work/credits', 'autonomous-work/pricing'],
  },
  {
    section: 'billing',
    slug: 'payments',
    title: 'Payments',
    description: 'How PawOS processes payments.',
    blocks: [
      { type: 'paragraph', text: 'Subscriptions and Ticket Wallet top-ups are paid through secure checkout — the PawOS desktop app never handles your card details.' },
    ],
    related: ['billing/subscriptions'],
  },
  {
    section: 'billing',
    slug: 'subscriptions',
    title: 'Subscriptions',
    description: 'Managing your plan.',
    blocks: [
      { type: 'paragraph', text: 'Change or cancel your subscription from Account → Billing inside the app, or from your PawOS account on the web.' },
    ],
    related: ['billing/plans', 'billing/upgrades'],
  },
  {
    section: 'billing',
    slug: 'upgrades',
    title: 'Upgrades',
    description: 'What actually changes when you upgrade.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Upgrading from Go to Pro is the single most consequential change — it grants the advancedRuntimes entitlement, which unlocks real execution (file edits, commands, installs, deploys) across every runtime, not a Coding-Runtime-specific toggle.',
      },
    ],
    related: ['concepts/entitlements', 'billing/plans'],
  },
  {
    section: 'billing',
    slug: 'limits',
    title: 'Limits',
    description: 'What happens when you run out of Paw Compute.',
    blocks: [
      {
        type: 'list',
        items: [
          'Your plan allowance, reset schedule and any weekly limit are shown in Settings → Usage.',
          'Organization seat allowances and pooling are shown in your organization billing settings.',
          'Reached your weekly limit? The rest of your plan is still there — it becomes available again when the weekly limit resets.',
          'Used all of your plan’s PC for this billing period? Buy credits, upgrade, or wait for your plan to renew. Included plan PC does not carry over.',
          'Credit purchase amounts, conversion, expiry and application order can change; review the terms displayed at checkout.',
          'Everything else keeps working — hitting a limit is never a hard stop for the rest of the app.',
          'PawOS Web and your phone’s browser use the same allowance on paid plans; Go has 4 Web messages of its own. See Web, Mobile & Desktop.',
        ],
      },
    ],
    related: ['billing/paw-compute', 'billing/upgrades', 'billing/web-and-desktop'],
  },
  {
    section: 'billing',
    slug: 'web-and-desktop',
    title: 'Web, Mobile & Desktop',
    description: 'What you can do and how much you can use on PawOS Web, a phone browser and PawOS Desktop.',
    keywords: ['web', 'mobile', 'phone', 'browser', 'desktop', 'limits', 'capabilities', 'web messages', 'change code', 'small change', 'preview'],
    blocks: [
      {
        type: 'lead',
        text: 'Your PawOS account is one account everywhere: one plan, one usage allowance and one chat history across PawOS Desktop, PawOS Web and your phone’s browser. What changes between them is what each one can do.',
      },
      { type: 'heading', level: 2, text: 'Limits', id: 'limits' },
      {
        type: 'table',
        headers: ['Plan', 'PawOS Desktop', 'PawOS Web and mobile browser', 'Shared?'],
        rows: [
          ['Go', '500 PC every 14 days. Planning and analysis only.', '4 Web messages in total (chat and code changes together, across all chats). Prompts of up to 2 lines.', 'No — separate. Desktop use never counts toward your 4 Web messages.'],
          ['Pro', '2,000 PC per billing period, weekly limit 1,000 PC', 'The same allowance', 'Yes — one allowance'],
          ['Pro Max 5x', '10,000 PC per billing period, weekly limit 5,000 PC', 'The same allowance', 'Yes — one allowance'],
          ['Pro Max 20x', '25,000 PC per billing period, weekly limit 12,500 PC', 'The same allowance', 'Yes — one allowance'],
          ['Team', 'Your seat: Standard 2,000 PC or Premium 10,000 PC a month', 'The same seat allowance', 'Yes — one allowance per member'],
          ['Enterprise', 'Your organization’s shared pool', 'The same pool — each Web message counts once, like a Desktop message', 'Yes — one pool'],
        ],
      },
      {
        type: 'list',
        items: [
          'On paid plans, using PawOS on your phone uses the same Paw Compute as using it on your computer. There is no separate Web balance.',
          'A code change from Web uses at least two model calls, plus any automatic fixes. On Go, a whole change counts as one of your 4 messages; on Enterprise, it counts once against your organization’s pool.',
          'A reply that fails, or a change PawOS declines or that changes nothing, never uses a Go message and is never charged.',
          'Each Web message can be up to 4,000 characters. Photos can be up to 5 MB, and text or code files up to 60 KB.',
        ],
      },
      { type: 'heading', level: 2, text: 'What you can do', id: 'capabilities' },
      {
        type: 'table',
        headers: ['', 'Desktop', 'Web / mobile — Go', 'Web / mobile — paid plans'],
        rows: [
          ['Chat, explain, plan, review code you paste', 'Yes', 'Yes (4 messages, short prompts)', 'Yes'],
          ['Attach photos (camera or library) and files', 'Yes', 'No — messages only', 'Yes'],
          ['Change code in your GitHub repository', 'Yes (paid plans, in your local project)', 'Small frontend changes to existing files — text, headings, titles, buttons, styles; up to 2 files. No new files, images, icons, fonts or other assets.', 'Frontend and backend changes; up to 10 files'],
          ['Live preview in a new tab', 'Runs locally instead', 'Yes', 'Yes'],
          ['Automatic fix if a check or deployment fails', 'Runs tests locally instead', '1 attempt', '2 attempts'],
          ['Task panel showing each step of a change', 'Yes', 'Yes', 'Yes'],
          ['The same chats on every device', 'Yes', 'Yes', 'Yes'],
          ['Local files, terminal, tests, installing packages', 'Yes (paid plans)', 'No', 'No'],
          ['Autonomous Work, browser automation', 'Yes, as your plan allows', 'No', 'No'],
          ['Jira, Linear, Slack and other connected tools', 'Yes, as your plan allows', 'No', 'No'],
          ['Desktop companion experience', 'Yes', 'No', 'No; offline behavior is not verified'],
        ],
      },
      {
        type: 'note',
        text: 'Code changes from Web need GitHub connected and a repository selected. PawOS commits and pushes to the repository’s default branch; if the branch is protected, it opens a pull request instead and tells you.',
      },
      {
        type: 'warning',
        text: 'For your safety, Web never edits environment files (.env), keys or certificates, CI workflows (.github) or lockfiles, on any plan.',
      },
      {
        type: 'tip',
        text: 'Need your computer for something? Use Continue in PawOS Desktop — the chat is already there, labelled with where each message ran.',
      },
    ],
    related: ['getting-started/web-and-mobile', 'billing/plans', 'billing/limits', 'billing/usage'],
  },
  {
    section: 'billing',
    slug: 'tier-comparison',
    title: 'Tier Comparison & Pricing',
    description: 'Plan capabilities vary; use the live billing screen for current pricing and limits.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Individual Accounts',
        id: 'individual-accounts',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Go Tier',
        id: 'go-tier-free',
      },
      {
        type: 'paragraph',
        text: 'The Go plan provides the capabilities and allowance shown for your account in PawOS billing settings.',
      },
      {
        type: 'list',
        items: [
          'Current price, allowance, execution entitlements and payment requirements are shown in PawOS billing settings.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Pro Tier',
        id: 'pro-tier',
      },
      {
        type: 'paragraph',
        text: 'Unlock full execution capabilities with the Pro tier — everything you need for everyday professional development.',
      },
      {
        type: 'list',
        items: [
          'Check billing settings for current price and available billing intervals.',
          'Execution: Full file edits, commands, installs, deployments',
          'Paw Compute: 2,000 PC per billing period, with a weekly limit of 1,000 PC (on the annual plan, 2,000 PC each month)',
          'Autonomous Work: Not included — available on Pro Max and above',
          'Use Cases: Individual developers, freelancers, solo work',
          'Billing: Individual account, auto-renewal (cancel anytime)',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Pro Max Tier',
        id: 'pro-max-tier',
      },
      {
        type: 'paragraph',
        text: 'For power users who need significantly higher usage allowances and advanced features.',
      },
      {
        type: 'list',
        items: [
          'Check billing settings for current plan options, prices and allowances.',
          'Execution: Full capabilities (same as Pro)',
          'Advanced Features: Extended context windows, custom configurations',
          'Autonomous Work: Included — paid from your Ticket Balance at volume-tiered pricing',
          'Billing: Monthly only, individual account',
          'Use Cases: Data scientists, full-stack developers, complex systems',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Organization Accounts',
        id: 'organization-accounts',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Team Tier',
        id: 'team-tier',
      },
      {
        type: 'paragraph',
        text: 'Perfect for small to medium teams needing collaboration, shared workspaces, and organized billing. Maximum 150 seats per organization.',
      },
      {
        type: 'list',
        items: [
          'Check organization billing settings for current per-seat price.',
          'Maximum Seats: 150 seats hard limit',
          'Seat types and prices depend on current organization options.',
          'Execution: Full Pro capabilities per team member',
          'Paw Compute: each member’s own seat — Standard 2,000 PC, Premium 10,000 PC a month (no shared pool)',
          'Team Features: Shared organization workspace, invite members by email, audit logs',
          'Organization Settings: Team name, member roles (Owner, Admin, Member)',
          'Available billing and payment methods are shown in organization billing settings.',
          'Address Capture: Automatic for invoices, billing address required',
          'Use Cases: Startup teams, consulting agencies, in-house development teams',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Enterprise Tier (Custom Pricing)',
        id: 'enterprise-tier',
      },
      {
        type: 'paragraph',
        text: 'For large organizations with custom needs, SSO, compliance requirements, and unlimited seats.',
      },
      {
        type: 'list',
        items: [
          'Cost: Custom per-seat rates based on volume (contact sales)',
          'Maximum Seats: Unlimited',
          'Negotiation: Annual or multi-year contracts available',
          'Execution: All Team capabilities with no restrictions',
          'Paw Compute: drawn from your organization’s shared pool, configured for your organization',
          'Advanced Features: SSO/SAML, custom deployments, on-premise options',
          'Compliance: Custom SLA agreements, dedicated support channel',
          'Audit & Security: Full audit logs, advanced permission controls',
          'Support: Dedicated account manager, regular business reviews',
          'Use Cases: Fortune 500 companies, large consulting firms, strict compliance needs',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Payment Methods',
        id: 'payment-methods',
      },
      {
        type: 'table',
        headers: ['Amount', 'Method', 'Tier(s)'],
        rows: [
          ['Current checkout options', 'See payment methods offered to your account', 'Depends on account and region'],
        ],
      },
    ],
    related: ['billing/plans', 'billing/payments', 'billing/subscriptions'],
  },
  {
    section: 'billing',
    slug: 'team-governance',
    title: 'Team Tier Details',
    description: 'Seat limits and team management for Team tier.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Seat Limits',
        id: 'seat-limits',
      },
      {
        type: 'paragraph',
        text: 'Team tier organizations can have up to 150 seats maximum. If you need more seats, contact support@pawos.com to discuss Enterprise tier.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Billing Address',
        id: 'billing-address',
      },
      {
        type: 'paragraph',
        text: 'Team organizations require a billing address for invoices. Address is used for billing purposes only.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Payment Methods',
        id: 'payment-methods-team',
      },
      {
        type: 'list',
        items: [
          'Save and manage multiple payment cards',
          'Current payment options are shown during checkout.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Team Management',
        id: 'team-management',
      },
      {
        type: 'list',
        items: [
          'Invite team members by email',
          'Choose standard or premium seats',
          'Manage team settings and billing',
        ],
      },
    ],
    related: ['billing/tier-comparison', 'billing/payments'],
  },
];
