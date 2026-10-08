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
          'Restart your computer — after a long uptime the app can occasionally fail to access the graphics card or display.',
          'Reinstall PawOS Desktop from the Microsoft Store.',
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
    title: 'AI response problems',
    description: 'When PawOS doesn’t respond, or tools don’t work.',
    blocks: [
      {
        type: 'list',
        items: [
          'Check your internet connection — Paw’s reasoning needs to be online.',
          'Check Settings → Usage — if you’ve reached your plan’s usage limit, responses pause until it refreshes or you upgrade.',
          'If Paw answers questions but won’t take actions, confirm you’re on Paw Pro or higher — actions such as file edits, commands and installs need Pro.',
        ],
      },
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
          'Confirm you’re on Paw Pro or higher — taking actions requires Pro; Paw Go is read-only. See Billing → Plans.',
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
      { type: 'paragraph', text: 'Everything else keeps working. If you reached your weekly limit, the rest of your plan becomes available again when the weekly limit resets. If you used all of your plan’s PC for the billing period, you can buy credits, upgrade, or wait for your plan to renew. See Billing → Limits.' },
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
          'A declined payment is reported by your bank or card issuer, not PawOS — check with them, or try another payment method.',
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
