import type { DocPage } from '../types';

export const conceptsPages: DocPage[] = [
  {
    section: 'concepts',
    slug: 'workspaces',
    title: 'Workspaces',
    description: 'The scoped project boundary PawOS operates inside.',
    blocks: [
      {
        type: 'lead',
        text: 'A workspace is a real folder on disk that PawOS has been pointed at — the boundary its file, terminal, and coding actions are scoped to for a given task.',
      },
      {
        type: 'paragraph',
        text: 'PawOS does not maintain a hidden global filesystem boundary; each request that touches files or runs commands carries an explicit working directory (cwd), and workspace-security checks (CodingRuntimeSecurity) verify a requested path actually falls inside the declared workspace root before any write or command executes.',
      },
      {
        type: 'note',
        text: 'Selecting a workspace root is itself a required step — a coding action attempted with no workspace selected fails with an explicit "select a workspace root" message rather than guessing a location.',
      },
    ],
    related: ['getting-started/first-workspace', 'security/filesystem-access', 'coding/overview'],
  },
  {
    section: 'concepts',
    slug: 'working-history',
    title: 'Working History',
    description: 'The flat, per-request list of everything PawOS has done.',
    blocks: [
      {
        type: 'lead',
        text: 'Working History is a single, flat list of every request PawOS has processed — one entry per conversation turn, whether or not it did anything destructive.',
      },
      {
        type: 'paragraph',
        text: 'Each entry links to that request’s Work Record. Status is derived honestly from what actually happened — Completed, Failed, Blocked, or Stopped — never fabricated as complete for unfinished work.',
      },
      {
        type: 'table',
        headers: ['Status', 'Meaning'],
        rows: [
          ['Completed', 'The request finished and every action it took succeeded'],
          ['Failed', 'An action ran and genuinely failed'],
          ['Blocked', 'Refused before running — entitlement, usage limit, or a security boundary'],
          ['Stopped', 'Ended mid-way (interrupted, or a pending confirmation nobody answered)'],
        ],
      },
    ],
    related: ['concepts/work-records', 'concepts/evidence'],
  },
  {
    section: 'concepts',
    slug: 'work-records',
    title: 'Work Records',
    description: 'The structured evidence produced by one completed request.',
    blocks: [
      {
        type: 'lead',
        text: 'A Work Record is the real, structured trace of one request — what commands ran, which files changed, what was verified, and why it stopped if it stopped early.',
      },
      {
        type: 'paragraph',
        text: 'It’s derived from an internal ExecutionRecord, which accumulates real evidence as actions run: command text, exit codes, real stdout/stderr, file operations, and structured validation results (typecheck/build/test/lint). Sections with no real evidence render an honest empty state — never a fabricated summary.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Software installation and PATH-repair actions currently only appear in a Work Record’s generic timeline (what ran, in what order) — their richer detail (package manager used, before/after PATH state, retry attempts) is not yet captured as structured evidence the way command and file evidence are.',
      },
    ],
    related: ['concepts/evidence', 'coding/software-installation', 'coding/work-records'],
  },
  {
    section: 'concepts',
    slug: 'plans',
    title: 'Plans',
    description: 'How PawOS proposes multi-step work before executing it.',
    blocks: [
      {
        type: 'lead',
        text: 'For non-trivial coding requests, PawOS can propose a concrete, file-by-file edit plan before applying anything — review before mutation, not mutation with a narration after the fact.',
      },
      {
        type: 'paragraph',
        text: 'A plan is a real, structured list of steps (one per affected file), not free text. Approval today is conversational — you tell PawOS to go ahead in chat.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'A dedicated visual plan-review UI (approve/reject a rendered diff per file, independent of chat) does not exist yet — plan approval is currently a conversational "yes, go ahead."',
      },
    ],
    related: ['coding/planning-and-review', 'coding/code-editing'],
  },
  {
    section: 'concepts',
    slug: 'evidence',
    title: 'Evidence',
    description: 'PawOS’s discipline against reporting unfinished work as done.',
    blocks: [
      {
        type: 'lead',
        text: 'Evidence is the governing principle behind Work Records: a step is only ever reported as passed, verified, or completed if a real, independently-checked result says so.',
      },
      {
        type: 'list',
        items: [
          'A build is only "passed" once a real output artifact is confirmed to exist — not merely because the build command exited 0.',
          'A software install is only "verified" once a fresh-shell version check actually finds the tool — not because the installer exited without error.',
          'A step PawOS could not check is reported as skipped with a real reason, never silently assumed to have passed.',
        ],
      },
    ],
    related: ['concepts/work-records', 'coding/testing-and-validation'],
  },
  {
    section: 'concepts',
    slug: 'permissions',
    title: 'Permissions',
    description: 'The confirmation gate every destructive action passes through.',
    blocks: [
      {
        type: 'lead',
        text: 'Any action classified as destructive — writing a file, running a command, installing software, modifying PATH, deploying — requires an explicit confirmation before it runs, enforced by the execution engine itself, not just hinted at in a prompt.',
      },
      {
        type: 'paragraph',
        text: 'A request missing confirmation is refused with reason requires-confirmation before the underlying action ever executes. See Security & Permissions for the full model, including how this differs for Autonomous Work.',
      },
    ],
    related: ['security/permissions', 'autonomous-work/permissions'],
  },
  {
    section: 'concepts',
    slug: 'usage',
    title: 'Usage',
    description: 'How PawOS meters what a request costs, at a glance.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS measures usage as Paw Compute — a single weighted meter across every runtime, rather than a raw token count or a per-feature limit.',
      },
      {
        type: 'paragraph',
        text: 'You see one number: Paw Compute used this period. See Billing & Usage → Paw Compute for the full model, and Autonomous Work → Autonomous Work Credits for the separate, success-gated dollar wallet that funds Autonomous Ticket completions specifically.',
      },
    ],
    related: ['billing/paw-compute', 'billing/limits'],
  },
  {
    section: 'concepts',
    slug: 'entitlements',
    title: 'Entitlements',
    description: 'What each subscription tier actually unlocks, enforced server-side.',
    blocks: [
      {
        type: 'lead',
        text: 'An entitlement is a real, backend-enforced capability gate — checked by the main process before an action runs, not a UI-only restriction a client could bypass.',
      },
      {
        type: 'paragraph',
        text: 'The tier ladder is additive: Go → Pro → Pro Max → Team → Enterprise. The single most consequential gate is advancedRuntimes — it separates read-only planning/analysis (available on every tier, including free) from real execution (writing files, running commands, editing code), which requires Pro or higher.',
      },
      {
        type: 'table',
        headers: ['Tier', 'Execution (advancedRuntimes)'],
        rows: [
          ['Go', 'Not entitled — planning and analysis only'],
          ['Pro', 'Entitled'],
          ['Pro Max', 'Entitled (same runtime capabilities as Pro; higher Paw Compute allotment)'],
          ['Team', 'Entitled, plus organization features'],
          ['Enterprise', 'Entitled, plus organization + governance features'],
        ],
      },
      {
        type: 'note',
        text: 'Pro Max is deliberately capability-identical to Pro — it never unlocks a runtime feature Pro doesn’t have, only a larger usage allotment.',
      },
    ],
    related: ['billing/plans', 'reference/entitlements'],
  },
];
