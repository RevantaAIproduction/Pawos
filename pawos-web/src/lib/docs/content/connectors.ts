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
    description: 'Connect your Atlassian account to work from Jira tickets.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Connect with your Atlassian account. PawOS reads your Jira tickets so Autonomous Work and chat can work from them — see Autonomous Work → Connectors.',
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/linear'],
  },
  {
    section: 'connectors',
    slug: 'linear',
    title: 'Linear',
    description: 'Connect your Linear account to work from Linear tickets.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Connect with your Linear account. PawOS reads your Linear tickets so Autonomous Work and chat can work from them — see Autonomous Work → Connectors.',
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/jira'],
  },
  {
    section: 'connectors',
    slug: 'github',
    title: 'GitHub',
    description: 'Connect your GitHub account for issues and pull requests.',
    blocks: [
      {
        type: 'list',
        items: [
          'Read issues',
          'List and verify pull requests',
          'Comment on a pull request',
          'On PawOS Web and your phone: choose a repository and let Paw change code in it — every plan, Paw Go included (small changes)',
        ],
      },
      {
        type: 'tip',
        text: 'You can connect GitHub from PawOS Desktop or from the web, including on your phone (Dashboard → Integrations). It is the same connection everywhere.',
      },
    ],
    related: ['autonomous-work/connectors', 'connectors/gitlab', 'getting-started/web-and-mobile'],
  },
  {
    section: 'connectors',
    slug: 'gitlab',
    title: 'GitLab',
    description: 'Connect your GitLab account for merge requests.',
    blocks: [
      {
        type: 'list',
        items: [
          'List and verify merge requests',
          'Comment on a merge request',
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
