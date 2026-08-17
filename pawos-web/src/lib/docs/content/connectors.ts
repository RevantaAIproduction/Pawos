import type { DocPage } from '../types';

export const connectorsPages: DocPage[] = [
  {
    section: 'connectors',
    slug: 'overview',
    title: 'Connector Overview',
    description: 'The common architecture behind every real PawOS connector.',
    blocks: [
      {
        type: 'lead',
        text: 'A connector is a real integration with an external provider, authenticated through real OAuth where the provider supports it, behind one common ConnectorSDK interface — no per-provider special-casing in how PawOS decides whether an action is allowed.',
      },
      {
        type: 'paragraph',
        text: 'OAuth token exchange happens on PawOS’s backend, not inside the desktop app, so client secrets are never shipped to or stored on your machine.',
      },
      {
        type: 'note',
        text: 'Connecting most integrations currently requires the relevant connect* entitlement — see the tier note on each connector page.',
      },
    ],
    related: ['security/connectors', 'connectors/github'],
  },
  {
    section: 'connectors',
    slug: 'jira',
    title: 'Jira',
    description: 'Real Atlassian OAuth; read-only from Autonomous Work.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Connected via real Atlassian OAuth (3LO). Reading tickets is real. Writing back to a ticket (status changes, comments) from Autonomous Work is not implemented — see Autonomous Work → Connectors.',
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/linear'],
  },
  {
    section: 'connectors',
    slug: 'linear',
    title: 'Linear',
    description: 'Real OAuth connection; read-only from Autonomous Work.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Reading a Linear ticket is real. Writing back (status, comments) from Autonomous Work is not implemented — see Autonomous Work → Connectors.',
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/jira'],
  },
  {
    section: 'connectors',
    slug: 'github',
    title: 'GitHub',
    description: 'Real OAuth; issue reading, PR listing/verification, and PR comments are real.',
    blocks: [
      {
        type: 'list',
        items: [
          'Reading issues: real',
          'Listing and verifying pull requests: real',
          'Commenting on an existing pull request: real',
          'Automatically creating a new pull request: not implemented',
        ],
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/gitlab'],
  },
  {
    section: 'connectors',
    slug: 'gitlab',
    title: 'GitLab',
    description: 'Real OAuth; merge-request listing/verification and comments are real.',
    blocks: [
      {
        type: 'list',
        items: [
          'Listing and verifying merge requests: real',
          'Commenting on an existing merge request: real',
          'Automatically creating a new merge request: not implemented',
          'A dedicated GitLab issue connector does not exist',
        ],
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/github'],
  },
  {
    section: 'connectors',
    slug: 'slack',
    title: 'Slack',
    description: 'Real OAuth connection to a Slack workspace.',
    blocks: [{ type: 'paragraph', text: 'Connects a Slack workspace through the same OAuth-backed ConnectorSDK pattern as every other connector.' }],
    related: ['connectors/overview'],
  },
  {
    section: 'connectors',
    slug: 'google-workspace',
    title: 'Google Workspace',
    description: 'Real Google OAuth with incremental scope requests.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Uses real PKCE OAuth with incremental authorization — PawOS requests only the specific scope a capability needs (Drive, Gmail compose, Calendar, Contacts) at the point it’s actually needed, not one broad upfront grant.',
      },
      {
        type: 'note',
        text: 'Email sending is never automatic — PawOS opens a prefilled compose window; you send it yourself from your own account.',
      },
    ],
    related: ['connectors/overview', 'security/credentials'],
  },
  {
    section: 'connectors',
    slug: 'vercel',
    title: 'Vercel',
    description: 'Real hosting connector for deploy status and deployments.',
    blocks: [{ type: 'paragraph', text: 'A real hosting connector, part of the same set that includes Netlify and Railway — used by deploy and rollback actions, which go through the same confirmation and, for organizations, governance-approval gate as any other destructive action.' }],
    related: ['connectors/other-connectors', 'security/connectors'],
  },
  {
    section: 'connectors',
    slug: 'other-connectors',
    title: 'Other Connectors',
    description: 'Additional real, currently-supported connectors.',
    blocks: [
      {
        type: 'list',
        items: [
          'Netlify, Railway — hosting connectors alongside Vercel.',
          'Docker, kubectl, Terraform, and major cloud CLIs (AWS, GCP, Azure) — driven through the same allowlisted command mechanism described in Coding → Commands & Terminal, using your own already-authenticated local CLI, not a separate PawOS credential.',
        ],
      },
      {
        type: 'note',
        text: 'This list reflects connectors confirmed real in the current implementation — it is not exhaustive of every provider PawOS has ever experimented with.',
      },
    ],
    related: ['connectors/overview', 'coding/commands-and-terminal'],
  },
];
