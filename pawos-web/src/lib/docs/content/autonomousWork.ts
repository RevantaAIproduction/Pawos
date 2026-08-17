import type { DocPage } from '../types';

export const autonomousWorkPages: DocPage[] = [
  {
    section: 'autonomous-work',
    slug: 'overview',
    title: 'Overview',
    description: 'Unattended investigate → plan → implement → validate on a real ticket.',
    keywords: ['autonomous ticket resolution', 'autonomous engineering'],
    blocks: [
      {
        type: 'lead',
        text: 'Autonomous Work drives a real engineering cycle against a connected ticket — investigate, plan, implement, and validate — without a human present for each step, using the same execution engine and Coding Runtime a normal chat session uses, orchestrated headlessly.',
      },
      {
        type: 'paragraph',
        text: 'It is not a second, separate coding engine. A dedicated ConversationRuntime instance is fed the ticket as a synthetic request and drives the same tool-calling loop a human-typed request would.',
      },
      { type: 'heading', level: 2, id: 'lifecycle', text: 'Lifecycle' },
      {
        type: 'steps',
        items: [
          { title: 'Investigate', detail: 'Real evidence is gathered — console output, network requests, repository history, prior engineering memory — before anything is proposed.' },
          { title: 'Plan', detail: 'A concrete implementation plan is drafted and tracked as a live TODO list.' },
          { title: 'Implement', detail: 'Edits are applied using the same file-editing mechanism described in Coding → Code Editing.' },
          { title: 'Validate', detail: 'Real tests and the validation pipeline run against the change.' },
          { title: 'Report', detail: 'A structured engineering report captures what was found and changed, persisted as real memory.' },
        ],
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Deploying as part of this lifecycle, where applicable, goes through the same Infrastructure Runtime and approval gate as a manual deploy request — it is not automatic for every run.',
      },
    ],
    related: ['autonomous-work/eligibility', 'autonomous-work/permissions', 'autonomous-work/completion-and-charging'],
  },
  {
    section: 'autonomous-work',
    slug: 'eligibility',
    title: 'Eligibility',
    description: 'What Autonomous Work requires before it can run.',
    blocks: [
      {
        type: 'list',
        items: [
          'An account or organization with the advancedRuntimes entitlement (Pro or higher) — Go accounts cannot use Autonomous Work.',
          'A connected source-control repository — Autonomous Ticket Resolution needs somewhere real to post its work.',
          'A connected ticket tracker, or a freeform issue description if no tracker connector is used.',
          'An available Autonomous Work Credits balance — see Billing.',
        ],
      },
    ],
    related: ['autonomous-work/connectors', 'autonomous-work/credits'],
  },
  {
    section: 'autonomous-work',
    slug: 'autonomous-tickets',
    title: 'Autonomous Tickets',
    description: 'What one Autonomous Ticket run actually produces.',
    blocks: [
      {
        type: 'lead',
        text: 'One run works through a single, well-scoped ticket end to end and is billed only once it genuinely, verifiably completes.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'The real, currently-implemented "external update" a run can make is posting a comment on an already-existing GitHub or GitLab pull/merge request. Automatically creating a brand-new pull request, and writing status/comments back to Jira or Linear, are not currently implemented — a run can read a Jira/Linear ticket, but cannot update it. Where marketing copy elsewhere describes this more broadly ("opens a pull request and updates the ticket"), treat this page as the accurate, current implementation status.',
      },
      {
        type: 'note',
        text: 'A run that can’t genuinely resolve the ticket reports honestly what it found and what’s blocking it, and is not billed for that run.',
      },
    ],
    related: ['autonomous-work/connectors', 'autonomous-work/completion-and-charging'],
  },
  {
    section: 'autonomous-work',
    slug: 'credits',
    title: 'Autonomous Work Credits',
    description: 'The dollar-denominated wallet that funds ticket completions.',
    blocks: [
      {
        type: 'lead',
        text: 'Autonomous Work Credits are a real dollar balance, separate from your Paw Compute allotment — add funds from inside the app (any amount, $30 minimum), and the balance never expires.',
      },
      {
        type: 'paragraph',
        text: 'A completed ticket deducts a real amount from this balance only once it genuinely completes — see Completion & Charging. A run that fails, is cancelled, hits its retry limit, or is denied approval is never charged.',
      },
    ],
    related: ['autonomous-work/pricing', 'billing/credits', 'autonomous-work/completion-and-charging'],
  },
  {
    section: 'autonomous-work',
    slug: 'pricing',
    title: 'Pricing',
    description: 'How the per-ticket rate is calculated.',
    blocks: [
      {
        type: 'lead',
        text: 'The rate is automatically volume-tiered by your account’s (or organization’s) cumulative completed-ticket count — no negotiation required.',
      },
      {
        type: 'table',
        headers: ['Cumulative volume', 'Rate'],
        rows: [
          ['Entry tier', '$5.00 per completed ticket'],
          ['High volume', 'Down to $3.00 per completed ticket'],
        ],
      },
      {
        type: 'note',
        text: 'The rate applies only to a ticket that genuinely, verifiably completes — see Completion & Charging.',
      },
    ],
    related: ['autonomous-work/credits', 'billing/paw-compute'],
  },
  {
    section: 'autonomous-work',
    slug: 'connectors',
    title: 'Connectors',
    description: 'Which real integrations Autonomous Work can use, and their real capability.',
    blocks: [
      {
        type: 'table',
        headers: ['Connector', 'Read', 'Write-back'],
        rows: [
          ['GitHub', 'Real (issues, pull requests)', 'Real — comment on an existing PR. Creating a new PR is not implemented.'],
          ['GitLab', 'Real (merge requests)', 'Real — comment on an existing MR. Creating a new MR is not implemented; there is no GitLab issue connector.'],
          ['Jira', 'Real (read ticket)', 'Not implemented — cannot update a ticket or post a comment'],
          ['Linear', 'Real (read ticket)', 'Not implemented — cannot update a ticket or post a comment'],
        ],
      },
      {
        type: 'note',
        text: 'This table reflects the actual connector implementation, confirmed by direct code review, not the tracker-agnostic framing used in some marketing copy — see Autonomous Tickets.',
      },
    ],
    related: ['connectors/overview', 'connectors/jira', 'connectors/github'],
  },
  {
    section: 'autonomous-work',
    slug: 'permissions',
    title: 'Permissions',
    description: 'Why Autonomous Work cannot install software or repair PATH on its own.',
    keywords: ['acceptEdits', 'waiting for permission', 'stuck autonomous task'],
    blocks: [
      {
        type: 'lead',
        text: 'Autonomous Work runs in a mode that auto-confirms only file edits (writeFile and applyCodeEdit) — every other destructive action, including running arbitrary commands, installing software, changing PATH, or committing to git, still requires a real confirmation nobody is present in an unattended run to give.',
      },
      {
        type: 'paragraph',
        text: 'If the model attempts one of those other actions, the run reaches a real, structurally-enforced "waiting for permission" state and stops there — it does not silently skip the step, retry indefinitely, or fall back to auto-approving it.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'Concretely: Autonomous Work cannot currently detect a missing dependency, install it, repair PATH, and continue on its own. It can detect and request permission, but installation and PATH repair require a human confirmation the unattended run has no way to supply. See Coding → Software Installation for the full user-directed-vs-autonomous comparison.',
      },
    ],
    related: ['coding/software-installation', 'security/permissions', 'autonomous-work/troubleshooting'],
  },
  {
    section: 'autonomous-work',
    slug: 'completion-and-charging',
    title: 'Completion & Charging',
    description: 'What "genuinely completes" means, and how billing is protected against double-charging.',
    blocks: [
      {
        type: 'lead',
        text: 'A run is only billed once it transitions through a server-side completion check — idempotent, so a duplicate completion signal can never charge twice.',
      },
      {
        type: 'list',
        items: [
          'A failed, cancelled, retry-exhausted, or approval-denied run is never charged.',
          'A stale run (left in progress for more than 24 hours with no further activity) is automatically reconciled as abandoned, never billed, never left silently "in progress" forever.',
          'Completion is currently self-reported by the run itself — independent, connector-verified confirmation that a PR truly merged or a ticket truly closed is not yet part of this check.',
        ],
      },
    ],
    related: ['autonomous-work/credits', 'autonomous-work/pricing', 'billing/limits'],
  },
  {
    section: 'autonomous-work',
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common Autonomous Work problems.',
    blocks: [
      {
        type: 'faq',
        items: [
          {
            q: 'A run says "waiting for permission" and never progresses — is it stuck?',
            a: 'No — this is the expected, honest behavior when the run needs a confirmation an unattended process can’t supply (e.g. installing a tool, running an unlisted command). See Permissions above. Resolve it by running the equivalent request in a normal chat session where you can confirm it directly.',
          },
          {
            q: 'Why wasn’t my Jira ticket updated after the run finished?',
            a: 'Jira write-back is not implemented today — see Connectors. The run’s real deliverable is the PR/MR comment (GitHub/GitLab) or its structured report, not a ticket status change.',
          },
          {
            q: 'Was I charged for a run that didn’t finish?',
            a: 'No — see Completion & Charging. Only a genuinely, server-side-confirmed complete run deducts from your balance.',
          },
        ],
      },
    ],
    related: ['autonomous-work/permissions', 'troubleshooting/autonomous-work-problems'],
  },
];
