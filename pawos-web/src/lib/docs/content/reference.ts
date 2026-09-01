import type { DocPage } from '../types';

export const referencePages: DocPage[] = [
  {
    section: 'reference',
    slug: 'architecture',
    title: 'Architecture',
    description: 'How PawOS is put together, for engineers.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS is an Electron desktop application. The main process owns system-level integration (filesystem, processes, IPC, native windows); the renderer process owns UI and the 3D companion.',
      },
      {
        type: 'paragraph',
        text: 'A router directs conversational requests to the runtime responsible for that category of action — Coding, Browser, Infrastructure, Communication, Companion, Governance — each independently real, not one monolithic prompt deciding everything.',
      },
      { type: 'note', text: 'Team and Enterprise organization features are backed by Supabase, with row-level security scoping every table to the requesting organization.' },
    ],
    related: ['reference/electron-architecture', 'reference/main-preload-renderer'],
  },
  {
    section: 'reference',
    slug: 'electron-architecture',
    title: 'Electron Architecture',
    description: 'Process model and packaging.',
    blocks: [
      { type: 'paragraph', text: 'A single main process supervises one renderer window for the primary UI plus a lightweight overlay window for the companion. Both windows share the same preload-exposed IPC bridge.' },
    ],
    related: ['reference/main-preload-renderer', 'reference/ipc'],
  },
  {
    section: 'reference',
    slug: 'main-preload-renderer',
    title: 'Main / Preload / Renderer',
    description: 'The three-process boundary and why it exists.',
    blocks: [
      {
        type: 'table',
        headers: ['Process', 'Owns'],
        rows: [
          ['Main', 'Filesystem, process spawning, native OS integration, the execution engine, entitlement checks'],
          ['Preload', 'A narrow, explicitly-typed bridge exposing only specific main-process capabilities to the renderer — never raw Node access'],
          ['Renderer', 'UI, the 3D companion, conversation state — calls into main only through the preload bridge'],
        ],
      },
      { type: 'note', text: 'This boundary is what makes the confirmation/entitlement gates real security checks rather than UI conventions — the renderer cannot bypass them because it has no direct filesystem or process-spawning access at all.' },
    ],
    related: ['reference/ipc', 'security/permissions'],
  },
  {
    section: 'reference',
    slug: 'ipc',
    title: 'IPC',
    description: 'The typed contract between renderer and main.',
    blocks: [
      {
        type: 'lead',
        text: 'Every renderer-to-main call goes through a typed, explicitly-defined IPC channel — a request shape in, a result shape out — registered once in the preload bridge and once in the main-process handler.',
      },
      { type: 'code', lang: 'ts', filename: 'example (illustrative)', code: `// renderer\nconst result = await window.pawos.executeAction({\n  type: 'installTool',\n  manager: 'winget',\n  packageId: 'Git.Git',\n  confirmed: true,\n});` },
      { type: 'note', text: 'This is not a public, external API — it\'s an internal contract between two processes of the same application. See API Reference.' },
    ],
    related: ['reference/main-preload-renderer', 'reference/api-reference'],
  },
  {
    section: 'reference',
    slug: 'coding-runtime',
    title: 'Coding Runtime',
    description: 'Internal architecture behind the Coding section.',
    blocks: [
      {
        type: 'paragraph',
        text: 'A plugin-based execution engine dispatches every action (file write, command, git operation, software install) to one of many independent plugins implementing a common prepare → execute → observe → verify → recover contract. A bounded (3-attempt) recovery loop is generic engine behavior, not reimplemented per plugin.',
      },
      { type: 'paragraph', text: 'See Coding → Overview for the user-facing description of the same system.' },
    ],
    related: ['coding/overview', 'reference/execution-and-evidence'],
  },
  {
    section: 'reference',
    slug: 'execution-and-evidence',
    title: 'Execution & Evidence',
    description: 'How a Work Record is actually assembled.',
    blocks: [
      {
        type: 'paragraph',
        text: 'One ExecutionRecord accumulates per request. As each action runs, its real result is folded into typed evidence — command evidence (exit code, output), file evidence (operation, path), and validation evidence (per-step pass/fail) — rather than a natural-language summary generated after the fact.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Not every action type has a dedicated evidence extractor yet — software installation and PATH-repair actions currently only populate the generic timeline, not their own structured evidence. See Coding → Work Records.',
      },
    ],
    related: ['concepts/work-records', 'coding/work-records'],
  },
  {
    section: 'reference',
    slug: 'entitlements',
    title: 'Entitlements',
    description: 'Internal implementation of the tier/capability gate.',
    blocks: [
      {
        type: 'paragraph',
        text: 'A central EntitlementService resolves a subscription tier to a real, additive feature set. The execution engine checks the advancedRuntimes entitlement before allowing a request classified as execution-class (file writes, commands, code edits) to proceed — checked in the main process, before the underlying action ever runs.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Software installation and PATH/environment-variable actions are not currently included in the execution-class gate — see Coding → Software Installation for the user-facing implication and Security → System Actions for the security framing.',
      },
    ],
    related: ['concepts/entitlements', 'coding/software-installation'],
  },
  {
    section: 'reference',
    slug: 'billing-architecture',
    title: 'Billing Architecture',
    description: 'Paw Compute, Autonomous Work Credits, and how they stay isolated.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Paw Compute (subscription usage) and Autonomous Work Credits (a dollar wallet funding ticket completions) are deliberately separate systems — a credit purchase can never be read by the ticket-billing code path, and vice versa.',
      },
      { type: 'paragraph', text: 'Autonomous Work completion billing runs through an idempotent, server-side RPC — a duplicate completion signal can never charge twice, and a stale run is automatically reconciled as abandoned rather than left billing indefinitely.' },
    ],
    related: ['billing/paw-compute', 'autonomous-work/completion-and-charging'],
  },
  {
    section: 'reference',
    slug: 'connector-architecture',
    title: 'Connector Architecture',
    description: 'The ConnectorSDK interface every real integration implements.',
    blocks: [
      { type: 'paragraph', text: 'Every connector implements one common ConnectorSDK interface (authenticate, connect, getStatus, validate) — OAuth token exchange happens on PawOS\'s backend, never inside the desktop client.' },
    ],
    related: ['connectors/overview', 'security/connectors'],
  },
  {
    section: 'reference',
    slug: 'api-reference',
    title: 'API Reference',
    description: 'The current, honest status of programmatic access to PawOS.',
    blocks: [
      {
        type: 'status',
        status: 'not-implemented',
        text: 'PawOS does not currently expose a public REST or GraphQL API for third-party integration. This page will document real endpoints if and when one ships — never a speculative draft.',
      },
      { type: 'paragraph', text: 'Internally, the desktop app communicates between its main and renderer processes over a typed IPC contract — see IPC — and Team/Enterprise features are backed by Supabase with row-level security. Neither is a public API.' },
    ],
    related: ['reference/ipc', 'reference/sdk-and-integrations'],
  },
  {
    section: 'reference',
    slug: 'sdk-and-integrations',
    title: 'SDK / Integrations',
    description: 'The current, honest status of a public PawOS SDK.',
    blocks: [
      {
        type: 'status',
        status: 'not-implemented',
        text: 'There is no separate public SDK today. See Architecture for the high-level system design, and Connectors for the real, currently-supported third-party integrations PawOS itself connects to.',
      },
    ],
    related: ['reference/architecture', 'connectors/overview'],
  },
  {
    section: 'reference',
    slug: 'changelog',
    title: 'Changelog',
    description: 'Where release notes live.',
    blocks: [
      { type: 'paragraph', text: 'See the site\'s dedicated Changelog page for dated release notes. PawOS follows semantic versioning once public releases begin.' },
    ],
    related: ['reference/architecture'],
  },
];
