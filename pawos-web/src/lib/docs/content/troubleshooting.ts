import type { DocPage } from '../types';

export const troubleshootingPages: DocPage[] = [
  {
    section: 'troubleshooting',
    slug: 'wont-start',
    title: "PawOS won't start",
    description: 'First steps when the app fails to launch.',
    blocks: [
      {
        type: 'list',
        items: [
          'Confirm your OS meets the minimum requirements — see Getting Started → System Requirements.',
          'Restart your machine — Electron apps occasionally fail to acquire a GPU/display lock after a long uptime.',
          'Reinstall using the latest installer for your platform.',
        ],
      },
    ],
    related: ['getting-started/system-requirements', 'getting-started/installation'],
  },
  {
    section: 'troubleshooting',
    slug: 'authentication-problems',
    title: 'Authentication problems',
    description: 'Sign-in and session issues.',
    blocks: [
      {
        type: 'list',
        items: [
          'Google sign-in loops back to the login screen — check that your system clock is accurate; OAuth token exchange fails on a significantly skewed clock.',
          'Session expired unexpectedly — sign out and back in; sessions are refreshed automatically under normal use.',
        ],
      },
    ],
    related: ['getting-started/installation'],
  },
  {
    section: 'troubleshooting',
    slug: 'ai-provider-problems',
    title: 'AI provider problems',
    description: 'When PawOS doesn’t respond, or tools don’t work.',
    blocks: [
      {
        type: 'warning',
        text: 'Tool-calling (the mechanism behind every real action PawOS takes — file edits, commands, installs) is currently only implemented for the Gemini reasoning provider. If you’ve configured a different model provider in Settings, PawOS can still converse, but action requests will not be reachable the same way.',
      },
      { type: 'paragraph', text: 'If actions aren’t running at all, check Settings → AI Model and confirm which provider is active.' },
    ],
    related: ['troubleshooting/tool-execution-problems'],
  },
  {
    section: 'troubleshooting',
    slug: 'tool-execution-problems',
    title: 'Tool execution problems',
    description: 'A requested action doesn’t run.',
    blocks: [
      {
        type: 'list',
        items: [
          'Confirm you’re on Paw Pro or higher — execution requires the advancedRuntimes entitlement; Paw Go is read-only. See Core Concepts → Entitlements.',
          'Check whether a confirmation is pending — a destructive action waits for your explicit yes before it runs.',
          'Check the request’s Work Record for the real, specific failure reason rather than assuming.',
        ],
      },
    ],
    related: ['concepts/entitlements', 'concepts/permissions'],
  },
  {
    section: 'troubleshooting',
    slug: 'software-installation-problems',
    title: 'Software installation problems',
    description: 'An install fails or can’t be verified.',
    blocks: [
      {
        type: 'list',
        items: [
          'PawOS reports the real failure — a package manager not being installed, a network failure, or a genuine install error — rather than a generic message. Read it.',
          'If install succeeded but verification failed, PawOS attempts one automatic repair pass before reporting failure — see Coding → Software Installation.',
          'If you denied the confirmation, nothing installed — re-ask and confirm this time.',
        ],
      },
    ],
    related: ['coding/software-installation', 'coding/path-and-environment-repair'],
  },
  {
    section: 'troubleshooting',
    slug: 'path-problems',
    title: 'PATH problems',
    description: 'A tool that should be installed still isn’t found.',
    blocks: [
      {
        type: 'list',
        items: [
          'If PawOS reports a tool "works in PowerShell but not Command Prompt" (or vice versa), your PATH genuinely differs between the two shells — this is a real environment inconsistency, not a PawOS bug.',
          'A PATH change may need a fresh terminal/app restart outside PawOS to take effect for tools not launched by PawOS itself.',
          'If elevation was declined, PawOS wrote to your User-scope PATH instead of Machine-scope — ask again and choose to retry elevated if you need it system-wide.',
        ],
      },
    ],
    related: ['coding/path-and-environment-repair'],
  },
  {
    section: 'troubleshooting',
    slug: 'connector-problems',
    title: 'Connector problems',
    description: 'A connected integration reports "not configured" or fails.',
    blocks: [
      {
        type: 'list',
        items: [
          'Confirm the connector shows as Connected in Settings → Connections, and reconnect if the token has expired.',
          'For local CLI-driven connectors (Docker, kubectl, cloud CLIs), confirm the CLI itself is installed and already authenticated on your machine — PawOS drives your own CLI, it doesn’t hold a separate credential for these.',
        ],
      },
    ],
    related: ['connectors/overview', 'security/credentials'],
  },
  {
    section: 'troubleshooting',
    slug: 'usage-limits',
    title: 'Usage limits',
    description: 'You’ve hit your Paw Compute limit for the period.',
    blocks: [
      { type: 'paragraph', text: 'Everything else keeps working. You’re offered three options: upgrade, buy additional Paw Compute directly, or use an existing Paw Credits balance. See Billing → Limits.' },
    ],
    related: ['billing/limits', 'billing/paw-compute'],
  },
  {
    section: 'troubleshooting',
    slug: 'autonomous-work-problems',
    title: 'Autonomous Work problems',
    description: 'A run is stuck, or didn’t update your tracker.',
    blocks: [
      { type: 'paragraph', text: 'See Autonomous Work → Troubleshooting for the full, dedicated FAQ — most commonly, a run reaching "waiting for permission" is expected behavior, not a bug.' },
    ],
    related: ['autonomous-work/troubleshooting', 'autonomous-work/permissions'],
  },
  {
    section: 'troubleshooting',
    slug: 'payment-problems',
    title: 'Payment problems',
    description: 'A payment failed or a balance looks wrong.',
    blocks: [
      {
        type: 'list',
        items: [
          'Payments are processed through Razorpay — a declined payment is reported by your bank/card issuer, not PawOS.',
          'Autonomous Work Credits and your subscription are separate balances — check you’re looking at the right one in Account → Billing.',
        ],
      },
    ],
    related: ['billing/payments', 'billing/credits'],
  },
  {
    section: 'troubleshooting',
    slug: 'preview-build-problems',
    title: 'Preview/build problems',
    description: 'A build reports passed but nothing actually runs.',
    blocks: [
      {
        type: 'paragraph',
        text: 'PawOS confirms a build passed by checking for a real output artifact, not just a zero exit code — if you’re seeing a mismatch, check the Work Record’s validation evidence for the actual command and output PawOS saw.',
      },
    ],
    related: ['coding/build-and-preview', 'coding/testing-and-validation'],
  },
];
