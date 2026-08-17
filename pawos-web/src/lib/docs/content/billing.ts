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
        text: 'Pro Max never unlocks a runtime capability Pro doesn’t already have — the difference is usage capacity, not features.',
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
      { type: 'paragraph', text: 'Your account shows Paw Compute used this period as one number — see Paw Compute below for how it’s calculated.' },
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
          'Everything else keeps working — hitting the limit is never a hard stop for the rest of the app.',
          'You’re offered three real options: upgrade your plan, buy additional Paw Compute directly, or draw down an existing Paw Credits balance if you have one.',
        ],
      },
    ],
    related: ['billing/paw-compute', 'billing/upgrades'],
  },
];
