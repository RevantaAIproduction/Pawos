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
    section: 'billing',
    slug: 'limits',
    title: 'Limits',
    description: 'What happens when you run out of Paw Compute.',
    blocks: [
      {
        type: 'list',
        items: [
          'Go: 132 PC / 5h and 528 PC / 7d.',
          'Pro: 400 PC / 5h and 1,600 PC / 7d.',
          'Pro Max: 2,000 PC / 5h and 8,000 PC / 7d.',
          'Team Standard: 800 PC per seat / 5h and 3,200 PC per seat / 7d.',
          'Team Premium: 2,000 PC per seat / 5h and 8,000 PC per seat / 7d.',
          'Enterprise: 4,000 PC per seat baseline / 5h and 16,000 PC per seat baseline / 7d, pooled/configurable.',
          'Everything else keeps working — hitting the limit is never a hard stop for the rest of the app.',
          'You’re offered three real options: upgrade your plan, buy additional Paw Compute directly, or draw down an existing Paw Credits balance if you have one.',
        ],
      },
    ],
    related: ['billing/paw-compute', 'billing/upgrades'],
  },
];
