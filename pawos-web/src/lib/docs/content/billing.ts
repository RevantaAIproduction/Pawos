import type { DocPage } from '../types';

export const billingPages: DocPage[] = [
  {
    section: 'billing',
    slug: 'plans',
    title: 'Plans',
    description: 'The real tier ladder and what each tier unlocks.',
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
          ['Go', 'Free', '500 PC every 14 days'],
          ['Pro', '$20/month', '2,000 PC per billing period'],
          ['Pro Max 5x', '$100/month', '10,000 PC per billing period'],
          ['Pro Max 20x', '$250/month', '25,000 PC per billing period'],
          ['Team', 'Per seat', 'Drawn from your organization’s shared pool'],
          ['Enterprise', 'Custom', 'Drawn from your organization’s shared pool'],
        ],
      },
      {
        type: 'note',
        text: '$1 of value = 100 PC. Pro and Pro Max include a weekly limit of half your plan’s PC, so your usage is spread across the billing period.',
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
          'Paw Go includes 500 PC every 14 days.',
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
        text: 'Pro and Pro Max include a set amount of PC per billing period with a weekly limit; credits add more. Paw Go includes 500 PC every 14 days. Team and Enterprise draw from an organization-wide pool.',
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
          'Go: 500 PC every 14 days.',
          'Pro: 2,000 PC per billing period ($20/month), with a weekly limit of 1,000 PC.',
          'Pro Max 5x: 10,000 PC per billing period ($100/month), with a weekly limit of 5,000 PC.',
          'Pro Max 20x: 25,000 PC per billing period ($250/month), with a weekly limit of 12,500 PC.',
          'Team and Enterprise: usage is drawn from your organization’s shared pool.',
          'Reached your weekly limit? The rest of your plan is still there — it becomes available again when the weekly limit resets.',
          'Used all of your plan’s PC for this billing period? Buy credits, upgrade, or wait for your plan to renew. Included plan PC does not carry over.',
          'Credits: pay any amount from $5 and get 100 PC per $1. Credits never expire and are used after your plan’s included PC.',
          'Everything else keeps working — hitting a limit is never a hard stop for the rest of the app.',
        ],
      },
    ],
    related: ['billing/paw-compute', 'billing/upgrades'],
  },
  {
    section: 'billing',
    slug: 'tier-comparison',
    title: 'Tier Comparison & Pricing',
    description: 'Detailed comparison of all PawOS tiers — Go, Pro, Pro Max, Team, and Enterprise.',
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
        text: 'Go Tier (Free)',
        id: 'go-tier-free',
      },
      {
        type: 'paragraph',
        text: 'The free tier is perfect for learning, experimentation and small projects, with PawOS’s AI assistance in the desktop app.',
      },
      {
        type: 'list',
        items: [
          'Cost: Free forever',
          'Execution: Planning and analysis only — no file edits, commands, or deployments',
          'Paw Compute: 500 PC every 14 days',
          'Use Cases: Learning, trying PawOS, read-only project analysis',
          'Payment: None required',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Pro Tier ($20 USD/month or ₹1,913 INR/month)',
        id: 'pro-tier',
      },
      {
        type: 'paragraph',
        text: 'Unlock full execution capabilities with the Pro tier — everything you need for everyday professional development.',
      },
      {
        type: 'list',
        items: [
          'Cost: $20/month (USD) or ₹1,913/month (INR)',
          'Annual Option: $200/year (USD) or ₹19,053/year (INR) — saves 17%',
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
        text: 'Pro Max Tier (from $100 USD/month or ₹9,565 INR/month)',
        id: 'pro-max-tier',
      },
      {
        type: 'paragraph',
        text: 'For power users who need significantly higher usage allowances and advanced features.',
      },
      {
        type: 'list',
        items: [
          'Pro Max 5x: $100/month (₹9,565) — 10,000 PC per billing period, with a weekly limit of 5,000 PC',
          'Pro Max 20x: $250/month (₹23,913) — 25,000 PC per billing period, with a weekly limit of 12,500 PC',
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
        text: 'Team Tier (₹1,913 per seat/month)',
        id: 'team-tier',
      },
      {
        type: 'paragraph',
        text: 'Perfect for small to medium teams needing collaboration, shared workspaces, and organized billing. Maximum 150 seats per organization.',
      },
      {
        type: 'list',
        items: [
          'Cost: ₹1,913/seat/month (multiply by total seats)',
          'Maximum Seats: 150 seats hard limit',
          'Seat Types: Standard (₹1,913) and Premium (₹9,565) available',
          'Execution: Full Pro capabilities per team member',
          'Paw Compute: drawn from your organization’s shared pool',
          'Team Features: Shared organization workspace, invite members by email, audit logs',
          'Organization Settings: Team name, member roles (Owner, Admin, Member)',
          'Billing: Invoice-based for amounts >₹50,000, credit card for ≤₹50,000',
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
          ['≤₹50,000', 'Credit card (Visa, Mastercard, RuPay)', 'Individual, Team'],
          ['>₹50,000', 'Invoice', 'Team, Enterprise'],
          ['Custom', 'Custom terms', 'Enterprise'],
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
          'Invoices for amounts >₹50,000',
          'Card for amounts ≤₹50,000',
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
