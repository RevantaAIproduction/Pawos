import type { DocNavSection, DocSectionId } from './types';

/**
 * Single source of truth for the documentation IA: sidebar grouping, page
 * order, breadcrumbs, and route validity all derive from this tree. Every
 * entry here must have a matching DocPage in lib/docs/content/*.ts — the
 * registry build (registry.ts) throws in dev if one is missing, so the
 * sidebar can never link to a 404.
 */
export const DOC_NAV: DocNavSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'installation', title: 'Installation' },
      { slug: 'system-requirements', title: 'System Requirements' },
      { slug: 'quickstart', title: 'Quickstart' },
      { slug: 'first-workspace', title: 'First Workspace' },
      { slug: 'first-coding-task', title: 'First Coding Task' },
    ],
  },
  {
    id: 'concepts',
    title: 'Core Concepts',
    items: [
      { slug: 'workspaces', title: 'Workspaces' },
      { slug: 'working-history', title: 'Working History' },
      { slug: 'work-records', title: 'Work Records' },
      { slug: 'plans', title: 'Plans' },
      { slug: 'evidence', title: 'Evidence' },
      { slug: 'permissions', title: 'Permissions' },
      { slug: 'usage', title: 'Usage' },
      { slug: 'entitlements', title: 'Entitlements' },
    ],
  },
  {
    id: 'coding',
    title: 'Coding',
    items: [
      { slug: 'overview', title: 'Coding Overview' },
      { slug: 'coding-workspace', title: 'Coding Workspace' },
      { slug: 'project-understanding', title: 'Project Understanding' },
      { slug: 'planning-and-review', title: 'Planning & Review' },
      { slug: 'code-editing', title: 'Code Editing' },
      { slug: 'commands-and-terminal', title: 'Commands & Terminal' },
      { slug: 'software-installation', title: 'Software Installation' },
      { slug: 'path-and-environment-repair', title: 'PATH & Environment Repair' },
      { slug: 'testing-and-validation', title: 'Testing & Validation' },
      { slug: 'build-and-preview', title: 'Build & Preview' },
      { slug: 'visual-verification', title: 'Visual Verification' },
      { slug: 'work-records', title: 'Work Records' },
    ],
  },
  {
    id: 'autonomous-work',
    title: 'Autonomous Work',
    items: [
      { slug: 'overview', title: 'Overview' },
      { slug: 'eligibility', title: 'Eligibility' },
      { slug: 'autonomous-tickets', title: 'Autonomous Tickets' },
      { slug: 'credits', title: 'Autonomous Work Credits' },
      { slug: 'pricing', title: 'Pricing' },
      { slug: 'connectors', title: 'Connectors' },
      { slug: 'permissions', title: 'Permissions' },
      { slug: 'completion-and-charging', title: 'Completion & Charging' },
      { slug: 'troubleshooting', title: 'Troubleshooting' },
    ],
  },
  {
    id: 'connectors',
    title: 'Connectors',
    items: [
      { slug: 'overview', title: 'Connector Overview' },
      { slug: 'jira', title: 'Jira' },
      { slug: 'linear', title: 'Linear' },
      { slug: 'github', title: 'GitHub' },
      { slug: 'gitlab', title: 'GitLab' },
      { slug: 'slack', title: 'Slack' },
      { slug: 'google-workspace', title: 'Google Workspace' },
      { slug: 'vercel', title: 'Vercel' },
      { slug: 'other-connectors', title: 'Other Connectors' },
    ],
  },
  {
    id: 'companion',
    title: 'Companion',
    items: [
      { slug: 'overview', title: 'Companion' },
      { slug: 'custom-companion', title: 'Custom Companion' },
      { slug: '3d-model-requirements', title: '3D Model Requirements' },
      { slug: 'wake-word', title: 'Wake Word' },
      { slug: 'desktop-companion', title: 'Desktop Companion' },
      { slug: 'permissions', title: 'Companion Permissions' },
    ],
  },
  {
    id: 'mobile',
    title: 'Mobile',
    items: [
      { slug: 'overview', title: 'Mobile Overview' },
      { slug: 'connectivity', title: 'Mobile Connectivity' },
      { slug: 'presence', title: 'Mobile Presence' },
      { slug: 'supported-capabilities', title: 'Supported Capabilities' },
      { slug: 'limitations', title: 'Limitations' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Usage',
    items: [
      { slug: 'plans', title: 'Plans' },
      { slug: 'tier-comparison', title: 'Tier Comparison & Pricing' },
      { slug: 'team-governance', title: 'Team Governance & Controls' },
      { slug: 'usage', title: 'Usage' },
      { slug: 'paw-compute', title: 'Paw Compute' },
      { slug: 'credits', title: 'Autonomous Work Credits' },
      { slug: 'payments', title: 'Payments' },
      { slug: 'subscriptions', title: 'Subscriptions' },
      { slug: 'upgrades', title: 'Upgrades' },
      { slug: 'limits', title: 'Limits' },
    ],
  },
  {
    id: 'security',
    title: 'Security & Permissions',
    items: [
      { slug: 'permissions', title: 'Permissions' },
      { slug: 'command-safety', title: 'Command Safety' },
      { slug: 'filesystem-access', title: 'Filesystem Access' },
      { slug: 'credentials', title: 'Credentials' },
      { slug: 'connectors', title: 'Connectors' },
      { slug: 'system-actions', title: 'System Actions' },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    items: [
      { slug: 'wont-start', title: "PawOS won't start" },
      { slug: 'authentication-problems', title: 'Authentication problems' },
      { slug: 'ai-provider-problems', title: 'AI provider problems' },
      { slug: 'tool-execution-problems', title: 'Tool execution problems' },
      { slug: 'software-installation-problems', title: 'Software installation problems' },
      { slug: 'path-problems', title: 'PATH problems' },
      { slug: 'connector-problems', title: 'Connector problems' },
      { slug: 'usage-limits', title: 'Usage limits' },
      { slug: 'autonomous-work-problems', title: 'Autonomous Work problems' },
      { slug: 'payment-problems', title: 'Payment problems' },
      { slug: 'preview-build-problems', title: 'Preview/build problems' },
    ],
  },
  {
    id: 'reference',
    title: 'Developer / Reference',
    items: [
      { slug: 'architecture', title: 'Architecture' },
      { slug: 'electron-architecture', title: 'Electron Architecture' },
      { slug: 'main-preload-renderer', title: 'Main / Preload / Renderer' },
      { slug: 'ipc', title: 'IPC' },
      { slug: 'coding-runtime', title: 'Coding Runtime' },
      { slug: 'execution-and-evidence', title: 'Execution & Evidence' },
      { slug: 'entitlements', title: 'Entitlements' },
      { slug: 'billing-architecture', title: 'Billing Architecture' },
      { slug: 'connector-architecture', title: 'Connector Architecture' },
      { slug: 'api-reference', title: 'API Reference' },
      { slug: 'sdk-and-integrations', title: 'SDK / Integrations' },
      { slug: 'changelog', title: 'Changelog' },
    ],
  },
];

export function findNavSection(id: DocSectionId): DocNavSection | undefined {
  return DOC_NAV.find((s) => s.id === id);
}

export function allSectionIds(): DocSectionId[] {
  return DOC_NAV.map((s) => s.id);
}
