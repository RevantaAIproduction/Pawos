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
        headers: ['Tier', '5-hour rolling Paw Compute', '7-day rolling Paw Compute'],
        rows: [
          ['Go', '132 PC', '528 PC'],
          ['Pro', '400 PC', '1,600 PC'],
          ['Pro Max', '2,000 PC', '8,000 PC'],
          ['Team Standard', '800 PC/seat', '3,200 PC/seat'],
          ['Team Premium', '2,000 PC/seat', '8,000 PC/seat'],
          ['Enterprise', '4,000 PC/seat baseline, pooled/configurable', '16,000 PC/seat baseline, pooled/configurable'],
        ],
      },
    ],
    related: ['concepts/entitlements', 'billing/upgrades'],
  },
  {
    section: 'billing',
    slug: 'usage',
    title: 'Usage',
    description: 'How PawOS reports what you’ve used this period.',
    blocks: [
      { type: 'paragraph', text: 'Your account shows Paw Compute used in rolling windows, not a fixed monthly reset bucket. Normal conversation turns and tool continuations count; background/system usage and Fable are tracked separately from the rolling allowance.' },
      {
        type: 'list',
        items: [
          'Fresh input, cached input, output, and thinking tokens are normalized server-side into Paw Compute.',
          'The renderer submits provider-reported usage; the main process and billing engine compute the charge.',
          'Usage events are append-only and use run/session identifiers where the implementation supplies them.',
          'Rolling windows restore capacity naturally as older usage ages out; there is no midnight reset button.',
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
        text: 'The current implementation enforces both a 5-hour rolling window and a 7-day rolling window through PawComputeCapacityStore and RollingUsageGate. Enterprise is pooled/configurable rather than a personal local cap.',
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
      { type: 'paragraph', text: 'Subscription and Autonomous Work Credit top-ups are processed through Razorpay. Checkout happens on PawOS’s web backend, never inside the desktop app directly handling card details.' },
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
    section: ‘billing’,
    slug: ‘limits’,
    title: ‘Limits’,
    description: ‘What happens when you run out of Paw Compute.’,
    blocks: [
      {
        type: ‘list’,
        items: [
          ‘Go: 132 PC / 5h and 528 PC / 7d.’,
          ‘Pro: 400 PC / 5h and 1,600 PC / 7d.’,
          ‘Pro Max: 2,000 PC / 5h and 8,000 PC / 7d.’,
          ‘Team Standard: 800 PC per seat / 5h and 3,200 PC per seat / 7d.’,
          ‘Team Premium: 2,000 PC per seat / 5h and 8,000 PC per seat / 7d.’,
          ‘Enterprise: 4,000 PC per seat baseline / 5h and 16,000 PC per seat baseline / 7d, pooled/configurable.’,
          ‘Everything else keeps working — hitting the limit is never a hard stop for the rest of the app.’,
          ‘You’re offered three real options: upgrade your plan, buy additional Paw Compute directly, or draw down an existing Paw Credits balance if you have one.’,
        ],
      },
    ],
    related: [‘billing/paw-compute’, ‘billing/upgrades’],
  },
  {
    section: ‘billing’,
    slug: ‘tier-comparison’,
    title: ‘Tier Comparison & Pricing’,
    description: ‘Detailed comparison of all PawOS tiers — Go, Pro, Pro Max, Team, and Enterprise.’,
    blocks: [
      {
        type: ‘heading’,
        text: ‘Individual Accounts’,
      },
      {
        type: ‘heading’,
        level: 2,
        text: ‘Go Tier (Free)’,
      },
      {
        type: ‘paragraph’,
        text: ‘The free tier is perfect for learning, experimentation, and small projects. Get full access to Claude AI assistance with local desktop application.’,
      },
      {
        type: ‘list’,
        items: [
          ‘Cost: Free forever’,
          ‘Execution: Planning and analysis only — no file edits, commands, or deployments’,
          ‘Paw Compute: 132 PC / 5 hours, 528 PC / 7 days’,
          ‘Use Cases: Learning, trying PawOS, read-only project analysis’,
          ‘Payment: None required’,
        ],
      },
      {
        type: ‘heading’,
        level: 2,
        text: ‘Pro Tier ($20 USD/month or ₹1,913 INR/month)’,
      },
      {
        type: ‘paragraph’,
        text: ‘Unlock full execution capabilities with the Pro tier — everything you need for everyday professional development.’,
      },
      {
        type: ‘list’,
        items: [
          ‘Cost: $20/month (USD) or ₹1,913/month (INR)’,
          ‘Annual Option: $200/year (USD) or ₹19,053/year (INR) — saves 17%’,
          ‘Execution: Full file edits, commands, installs, deployments’,
          ‘Paw Compute: 400 PC / 5 hours, 1,600 PC / 7 days’,
          ‘Autonomous Work: Available at volume-tiered pricing’,
          ‘Use Cases: Individual developers, freelancers, solo work’,
          ‘Billing: Individual account, auto-renewal (cancel anytime)’,
        ],
      },
      {
        type: ‘heading’,
        level: 2,
        text: ‘Pro Max Tier ($100 USD/month or ₹9,565 INR/month)’,
      },
      {
        type: ‘paragraph’,
        text: ‘For power users who need significantly higher usage allowances and advanced features.’,
      },
      {
        type: ‘list’,
        items: [
          ‘Cost: $100/month (USD) or ₹9,565/month (INR)’,
          ‘Variants: Available in 5x (₹9,565) and 20x (₹23,913) usage multiples’,
          ‘Execution: Full capabilities (same as Pro)’,
          ‘Paw Compute: 2,000 PC / 5 hours, 8,000 PC / 7 days (5x variant)’,
          ‘Advanced Features: Extended context windows, custom configurations’,
          ‘Autonomous Work: Same volume-tiered pricing, higher quotas’,
          ‘Billing: Monthly only, individual account’,
          ‘Use Cases: Data scientists, full-stack developers, complex systems’,
        ],
      },
      {
        type: ‘heading’,
        text: ‘Organization Accounts’,
      },
      {
        type: ‘heading’,
        level: 2,
        text: ‘Team Tier (₹1,913 per seat/month)’,
      },
      {
        type: ‘paragraph’,
        text: ‘Perfect for small to medium teams needing collaboration, shared workspaces, and organized billing. Maximum 150 seats per organization.’,
      },
      {
        type: ‘list’,
        items: [
          ‘Cost: ₹1,913/seat/month (multiply by total seats)’,
          ‘Maximum Seats: 150 seats hard limit’,
          ‘Seat Types: Standard (₹1,913) and Premium (₹9,565) available’,
          ‘Execution: Full Pro capabilities per team member’,
          ‘Paw Compute: 800 PC/seat / 5h (Standard), 2,000 PC/seat / 5h (Premium)’,
          ‘Team Features: Shared organization workspace, invite members by email, audit logs’,
          ‘Organization Settings: Team name, member roles (Owner, Admin, Member)’,
          ‘Billing: Invoice-based for amounts >₹50,000, credit card for ≤₹50,000’,
          ‘Address Capture: Automatic for invoices, billing address required’,
          ‘Use Cases: Startup teams, consulting agencies, in-house development teams’,
        ],
      },
      {
        type: ‘heading’,
        level: 2,
        text: ‘Enterprise Tier (Custom Pricing)’,
      },
      {
        type: ‘paragraph’,
        text: ‘For large organizations with custom needs, SSO, compliance requirements, and unlimited seats.’,
      },
      {
        type: ‘list’,
        items: [
          ‘Cost: Custom per-seat rates based on volume (contact sales)’,
          ‘Maximum Seats: Unlimited’,
          ‘Negotiation: Annual or multi-year contracts available’,
          ‘Execution: All Team capabilities with no restrictions’,
          ‘Paw Compute: 4,000+ PC/seat baseline, pooled and configurable’,
          ‘Advanced Features: SSO/SAML, custom deployments, on-premise options’,
          ‘Compliance: Custom SLA agreements, dedicated support channel’,
          ‘Audit & Security: Full audit logs, advanced permission controls’,
          ‘Support: Dedicated account manager, regular business reviews’,
          ‘Use Cases: Fortune 500 companies, large consulting firms, strict compliance needs’,
        ],
      },
      {
        type: ‘heading’,
        text: ‘Payment Methods’,
      },
      {
        type: ‘table’,
        headers: [‘Amount’, ‘Method’, ‘Tier(s)’],
        rows: [
          [‘≤₹50,000’, ‘Credit card (Visa, Mastercard, RuPay)’, ‘Individual, Team’],
          [‘>₹50,000’, ‘Invoice’, ‘Team, Enterprise’],
          [‘Custom’, ‘Custom terms’, ‘Enterprise’],
        ],
      },
    ],
    related: [‘billing/plans’, ‘billing/payments’, ‘billing/subscriptions’],
  },
  {
    section: ‘billing’,
    slug: ‘team-governance’,
    title: ‘Team Tier Details’,
    description: ‘Seat limits and team management for Team tier.’,
    blocks: [
      {
        type: ‘heading’,
        text: ‘Seat Limits’,
      },
      {
        type: ‘paragraph’,
        text: ‘Team tier organizations can have up to 150 seats maximum. If you need more seats, contact support@pawos.com to discuss Enterprise tier.’,
      },
      {
        type: ‘heading’,
        text: ‘Billing Address’,
      },
      {
        type: ‘paragraph’,
        text: ‘Team organizations require a billing address for invoices. Address is used for billing purposes only.’,
      },
      {
        type: ‘heading’,
        text: ‘Payment Methods’,
      },
      {
        type: ‘list’,
        items: [
          ‘Save and manage multiple payment cards’,
          ‘Invoices for amounts >₹50,000’,
          ‘Card for amounts ≤₹50,000’,
        ],
      },
      {
        type: ‘heading’,
        text: ‘Team Management’,
      },
      {
        type: ‘list’,
        items: [
          ‘Invite team members by email’,
          ‘Choose standard or premium seats’,
          ‘Manage team settings and billing’,
        ],
      },
    ],
    related: [‘billing/tier-comparison’, ‘billing/payments’],
  },
];
