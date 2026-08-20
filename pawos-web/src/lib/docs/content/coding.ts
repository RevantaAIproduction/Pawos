import type { DocPage } from '../types';

export const codingPages: DocPage[] = [
  {
    section: 'coding',
    slug: 'overview',
    title: 'Coding Overview',
    description: 'What the Coding Runtime actually does, and its real boundaries.',
    keywords: ['coding runtime', 'ide', 'copilot'],
    blocks: [
      {
        type: 'lead',
        text: 'The Coding Runtime lets PawOS understand a real project, propose and apply multi-file edits as real patches, run a project through its own real build/test/lint pipeline, and self-heal a bounded number of times when validation fails.',
      },
      {
        type: 'paragraph',
        text: 'It is a horizontal extension of PawOS’s general execution engine, not a separate product — the same confirmation gate, the same Work Record evidence, and the same tier ladder apply here as everywhere else.',
      },
      { type: 'heading', level: 2, id: 'what-it-does-well', text: 'What it does well' },
      {
        type: 'list',
        items: [
          'Multi-file edits are applied as real hunk-based patches, not blind whole-file rewrites.',
          'A real validation pipeline runs syntax → imports → typecheck → lint → build → tests, with a bounded (3-attempt) automatic self-heal retry on failure.',
          'Edit history, architectural decisions, and stated preferences persist across sessions in a queryable memory graph, not just chat scrollback.',
        ],
      },
      { type: 'heading', level: 2, id: 'real-boundaries', text: 'Real boundaries' },
      {
        type: 'status',
        status: 'partial',
        text: 'Deep, AST-level project understanding (dependency graphs, feature discovery) is TypeScript/JavaScript-only today. Other languages are still editable, but without the same structural understanding informing the edit.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Terminal access is a fixed allowlist of known developer tools, not arbitrary shell execution. Visual Plan Review is implemented for structured ExecutionPlan/code-edit plans, with file-by-file expansion and approve/reject controls. Approval is plan-level and resumes through conversation; code edits, commands, git writes, installs, deploys, and other destructive actions still pass through the existing authorization gate.',
      },
      { type: 'heading', level: 2, id: 'lifecycle', text: 'Coding lifecycle' },
      {
        type: 'steps',
        items: [
          { title: 'Request', detail: 'You describe the outcome. PawOS decides which project facts, files, tools, and validation steps are relevant.' },
          { title: 'Understand', detail: 'The runtime inspects the workspace, project structure, dependency graph, feature map, domain concepts, and likely affected files where supported.' },
          { title: 'Plan', detail: 'For multi-file edits, proposeCodeEditPlan returns a structured ExecutionPlan with one planned applyCodeEdit step per affected file.' },
          { title: 'Review', detail: 'The Plan Review card shows files affected, estimated line scope, per-file rationale, affected area, and proposed hunk diff where available.' },
          { title: 'Authorize', detail: 'Plan approval records intent. Actual edits and commands remain governed by the existing confirmation mechanism.' },
          { title: 'Edit', detail: 'Edits are applied as context-anchored hunks against current on-disk content, not blind whole-file rewrites.' },
          { title: 'Validate', detail: 'PawOS can run syntax, imports, typecheck, lint, build, and tests, reporting skipped steps honestly when a project lacks the script or config.' },
          { title: 'Preview and verify', detail: 'UI work can produce browser screenshots, console output, network evidence, and visual verification when invoked.' },
          { title: 'Evidence', detail: 'The Work Record keeps the action timeline, outputs, file changes, validation results, screenshots, failures, retries, and final report.' },
        ],
      },
    ],
    related: ['coding/coding-workspace', 'coding/project-understanding', 'concepts/entitlements'],
  },
  {
    section: 'coding',
    slug: 'coding-workspace',
    title: 'Coding Workspace',
    description: 'The live status surface for an in-progress coding task.',
    blocks: [
      {
        type: 'lead',
        text: 'While a coding task runs, PawOS surfaces a live canvas of what’s happening — current step, running processes, terminal output, build status, and test results — rather than a single chat bubble at the end.',
      },
      {
        type: 'list',
        items: [
          'Project understanding and coding memory are visible on every tier (read-only).',
          'Running processes, terminal output, build status, live diff summary, and browser preview require execution access (Pro or higher).',
        ],
      },
      {
        type: 'heading',
        level: 2,
        id: 'agent-activity',
        text: 'Agent Activity',
      },
      {
        type: 'paragraph',
        text: 'The Coding Workspace exposes concise operational activity such as analyzing repository, planning changes, editing files, running tests, checking browser, retrying, and verifying. This is execution status and evidence, not hidden chain-of-thought.',
      },
      {
        type: 'table',
        headers: ['Visible item', 'What it means', 'What it is not'],
        rows: [
          ['Running', 'An action has started and no result has returned yet.', 'A transcript of private model reasoning.'],
          ['Waiting', 'A confirmation, connector, or capability requirement is blocking progress.', 'A failed task.'],
          ['Done', 'The action returned ok:true and may include structured evidence.', 'A promise that unrelated checks also passed.'],
          ['Failed', 'The action returned a real failure result or launch/readiness problem.', 'A fabricated diagnosis.'],
          ['Retried', 'The execution trail recorded recovery attempts.', 'Unlimited self-healing.'],
        ],
      },
    ],
    related: ['coding/overview', 'concepts/entitlements'],
  },
  {
    section: 'coding',
    slug: 'project-understanding',
    title: 'Project Understanding',
    description: 'How PawOS learns the structure of your project before editing it.',
    blocks: [
      {
        type: 'lead',
        text: 'Before proposing edits, PawOS can build a real dependency graph and a feature map for a TypeScript/JavaScript project — which files import which, and which files cluster into a coherent feature (a route, its components, its data model).',
      },
      {
        type: 'note',
        text: 'This is available even on Paw Go — reading and understanding a project never requires the execution entitlement, only applying changes does.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'For languages other than TypeScript/JavaScript, PawOS honestly reports "language: unknown" for structural analysis rather than guessing — it can still read and edit the file, just without the dependency-graph-informed context.',
      },
    ],
    related: ['coding/overview', 'coding/planning-and-review'],
  },
  {
    section: 'coding',
    slug: 'planning-and-review',
    title: 'Planning & Review',
    description: 'Proposing a multi-file edit plan before anything is applied.',
    blocks: [
      {
        type: 'lead',
        text: 'For a non-trivial change, PawOS can propose a concrete plan — one step per file it intends to touch — before applying anything, so you can review the scope of a change before it happens.',
      },
      {
        type: 'paragraph',
        text: 'Approval now has a dedicated visual Plan Review card for structured plans. The card is still intentionally plan-level: it records approval or rejection in the conversation and preserves the existing destructive-action confirmation boundary.',
      },
      {
        type: 'steps',
        items: [
          { title: 'When a plan is created', detail: 'For non-trivial code edits, the model calls proposeCodeEditPlan with a description plus proposed edits. The plugin builds an ExecutionPlan and does not apply changes itself.' },
          { title: 'What the user sees', detail: 'The Task Card shows PAWOS PLAN, files affected, a numbered file list, each file rationale, estimated +/− line scope, and Approve Plan / Reject Plan buttons.' },
          { title: 'Per-file review', detail: 'Expanding a plan item shows file path, action, reason, affected area, proposed changes, and a View Diff section when applyCodeEdit hunk data exists.' },
          { title: 'Approve', detail: 'Approve Plan submits a normal user-visible message approving that plan id. The runtime can continue, but actual mutations still need their own confirmation.' },
          { title: 'Reject', detail: 'Reject Plan submits a normal user-visible rejection. Planned mutations are not executed, the conversation remains intact, and the user can request a revised plan.' },
          { title: 'Modify', detail: 'Ask for changes in chat after rejecting or before approving. PawOS should prepare a new plan rather than mutating the rejected one.' },
        ],
      },
      {
        type: 'warning',
        text: 'Do not confuse Plan Approved with Code Edit Authorized. The UI does not implement hunk-level approval, and it does not bypass applyCodeEdit, writeFile, runCommand, git, install, PATH, deploy, or connector confirmations.',
      },
      {
        type: 'code',
        lang: 'text',
        code: `PAWOS PLAN
Add dark mode

Files affected: 4

1. src/theme.ts
   CHANGE - Add color tokens

2. src/App.tsx
   CHANGE - Wire theme state

Estimated scope:
4 files
+126 / -31 lines

[Approve Plan] [Reject Plan]`,
      },
    ],
    related: ['concepts/plans', 'coding/code-editing'],
  },
  {
    section: 'coding',
    slug: 'code-editing',
    title: 'Code Editing',
    description: 'How file changes are actually applied — real patches, not rewrites.',
    blocks: [
      {
        type: 'lead',
        text: 'Multi-file edits are applied as real, hunk-based patches (surrounding context plus the changed lines), computed against the file’s current on-disk content — not a whole-file overwrite.',
      },
      {
        type: 'paragraph',
        text: 'Every edit that touches an existing file requires confirmation, following the same rule as every other destructive action in PawOS.',
      },
      {
        type: 'code',
        lang: 'text',
        code: `-  const status = 'pending';
+  const status: TaskStatus = 'pending';
   return { id, status, createdAt: Date.now() };`,
      },
    ],
    related: ['coding/planning-and-review', 'coding/testing-and-validation'],
  },
  {
    section: 'coding',
    slug: 'commands-and-terminal',
    title: 'Commands & Terminal',
    description: 'Running shell commands — an allowlist, not arbitrary execution.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS can run a fixed set of known developer-tool commands on your behalf — it does not have arbitrary shell access.',
      },
      {
        type: 'paragraph',
        text: 'The allowlist covers common package managers, source control, language runtimes, and infrastructure CLIs. A command whose first token isn’t on the list is refused outright, and every command is parsed into a real argv array (not a raw string handed to a shell), so shell-metacharacter injection isn’t possible even for allowlisted prefixes.',
      },
      {
        type: 'code',
        lang: 'text',
        code: 'npm, npx, node, git, python, python3, py, pip, pip3, yarn, pnpm,\nclaude, codex, gemini, ollama, java, javac,\ndocker, docker-compose, kubectl, helm,\naws, gcloud, az, doctl, terraform, ssh, scp, vercel, netlify',
      },
      {
        type: 'note',
        text: 'A long-running process (like a dev server) is started via a separate mechanism with its own lifecycle tracking, not the same one-shot command runner.',
      },
    ],
    related: ['coding/software-installation', 'security/command-safety'],
  },
  {
    section: 'coding',
    slug: 'software-installation',
    title: 'Software Installation',
    description: 'How PawOS detects, installs, and verifies developer tools — the real implementation.',
    keywords: ['winget', 'npm install', 'pip install', 'missing tool', 'install node', 'install python'],
    blocks: [
      {
        type: 'lead',
        text: 'PawOS can detect a missing developer tool, install it through a real package manager, and verify the install actually worked — a generic capability that works the same way for any winget, npm, pip, or VS Code extension package, not per-application logic.',
      },
      { type: 'heading', level: 2, id: 'detection', text: 'Missing-tool and software detection' },
      {
        type: 'paragraph',
        text: 'Detection runs a real, package-manager-specific query — winget list --id, npm list -g, pip show, or code --list-extensions — and separately, a version check runs the command in a genuinely fresh shell (not this process’s own environment) to confirm a tool is actually resolvable on PATH right now.',
      },
      {
        type: 'note',
        text: 'The version check runs in both a fresh cmd.exe and a fresh PowerShell process and requires both to agree — PATH can genuinely differ between the two, and a mismatch is reported honestly ("works in PowerShell but not in Command Prompt") rather than picked arbitrarily.',
      },
      { type: 'heading', level: 2, id: 'installation-methods', text: 'Installation methods and package managers' },
      {
        type: 'table',
        headers: ['Manager', 'Install command shape'],
        rows: [
          ['winget', 'winget install --id <id> --exact --silent --accept-package-agreements --accept-source-agreements (falls back to a plain-name search if the exact id doesn’t resolve)'],
          ['npm', 'npm install -g <package>'],
          ['pip', 'pip install <package>'],
          ['VS Code extension', 'code --install-extension <id>'],
        ],
      },
      { type: 'heading', level: 2, id: 'permission-flow', text: 'Permission flow' },
      {
        type: 'paragraph',
        text: 'Installing, updating, uninstalling, or repairing software is always a confirmed action — PawOS describes exactly what it’s about to run before it runs it, and the request is refused if confirmation is missing.',
      },
      { type: 'heading', level: 2, id: 'installer-execution', text: 'Installer execution' },
      {
        type: 'paragraph',
        text: 'The install command runs through the same process manager used for long-running processes (an 8-minute timeout, not the 45-second limit used for one-shot commands), since installers for large tools can genuinely take minutes.',
      },
      { type: 'heading', level: 2, id: 'verification', text: 'Verification' },
      {
        type: 'list',
        items: [
          'If you named a specific executable to check, or gave a version-check command, PawOS runs that real check after install.',
          'If you named a launch command and an expected process name (for a GUI app), PawOS confirms a real new OS process actually starts — not just that the launcher exited without error.',
          'Otherwise, PawOS falls back to re-running the same package-manager detection query as an honest minimum check.',
        ],
      },
      { type: 'heading', level: 2, id: 'retry-and-failure', text: 'Retry and failure' },
      {
        type: 'paragraph',
        text: 'If verification fails, PawOS attempts one automatic repair pass (a force-reinstall) and re-verifies — bounded to 3 attempts total, the same generic retry budget every self-healing action in PawOS shares. If verification still fails, the failure is reported honestly, including partial-success cases ("installed, but I still can’t verify it’s working") — never silently marked complete.',
      },
      { type: 'heading', level: 2, id: 'cancellation', text: 'Cancellation' },
      {
        type: 'paragraph',
        text: 'If confirmation is denied or the request is interrupted before it’s answered, nothing installs, and Working History reflects the request as stopped or blocked — never as completed.',
      },
      { type: 'heading', level: 2, id: 'user-directed-vs-autonomous', text: 'User-directed vs. Autonomous environment setup' },
      {
        type: 'warning',
        text: 'This distinction matters and is easy to assume incorrectly: a Pro user manually asking PawOS to "install Node.js" is not the same situation as an unattended Autonomous Work run encountering a missing dependency.',
      },
      {
        type: 'table',
        headers: ['', 'User-directed (chat)', 'Autonomous Work'],
        rows: [
          ['Who answers the confirmation?', 'You, in the conversation, in real time', 'Nobody is present to answer'],
          ['What happens on a missing tool?', 'PawOS asks; you confirm; it installs', 'The run reaches a real, structurally-enforced "waiting for permission" state and stops there'],
          ['Can it proceed automatically?', 'Yes, once you confirm', 'No — installing software or repairing PATH is never auto-confirmed in an unattended run'],
        ],
      },
      {
        type: 'note',
        text: 'Autonomous Work’s execution mode auto-confirms only file edits (writeFile/applyCodeEdit) — every other destructive action, including software installation and PATH changes, still requires a real confirmation nobody is present to give. See Autonomous Work → Permissions.',
      },
      { type: 'heading', level: 2, id: 'entitlement', text: 'Which tier can install software?' },
      {
        type: 'status',
        status: 'implemented',
        text: 'Software installation and PATH repair are currently available on every subscription tier, including Paw Go — gated only by the one-time confirmation, not by a subscription check. This is a deliberate finding from a direct implementation audit, not an assumption: unlike writeFile or runCommand (which require Pro’s execution entitlement), install/PATH actions are not currently included in that same gate.',
      },
    ],
    related: ['coding/path-and-environment-repair', 'autonomous-work/permissions', 'troubleshooting/software-installation-problems'],
  },
  {
    section: 'coding',
    slug: 'path-and-environment-repair',
    title: 'PATH & Environment Repair',
    description: 'How PawOS repairs Windows PATH and environment variables — the real implementation.',
    keywords: ['path not found', 'command not recognized', 'environment variable', 'java_home'],
    blocks: [
      {
        type: 'lead',
        text: 'PawOS can add a folder to the real Windows System PATH, or set any named environment variable (JAVA_HOME, ANDROID_HOME, and similar), requesting real administrator elevation when required.',
      },
      { type: 'heading', level: 2, id: 'path-detection', text: 'PATH detection' },
      {
        type: 'paragraph',
        text: 'Before writing, PawOS checks whether the target value is already present in the requested scope — an already-correct PATH is reported as such, never re-added.',
      },
      { type: 'heading', level: 2, id: 'path-repair', text: 'PATH repair' },
      {
        type: 'paragraph',
        text: 'Writes go to System (Machine) scope by default — the goal is "leave the computer correctly configured," not scoped so narrowly it only helps the current session. PawOS never silently downgrades to a User-scope write on its own.',
      },
      {
        type: 'steps',
        items: [
          { title: 'Attempt un-elevated', detail: 'Works immediately if the process already has administrator rights.' },
          { title: 'Request real elevation', detail: 'If Machine-scope access is denied, PawOS requests a genuine Windows UAC prompt.' },
          { title: 'Confirm by re-reading', detail: 'Because exit codes don’t reliably cross the elevation boundary, success is confirmed by re-reading the Machine-scope registry value afterward and comparing it to what was requested — never trusted from the elevated process’s own exit code.' },
          { title: 'Honest decision point', detail: 'If elevation isn’t available (declined, timed out, or a non-interactive session), PawOS reports this plainly and offers the real choice: retry elevated, or settle for a User-scope write instead.' },
        ],
      },
      { type: 'heading', level: 2, id: 'environment-changes', text: 'Environment changes' },
      {
        type: 'paragraph',
        text: 'A PATH or environment-variable change made moments earlier is made visible to the very next verification check in the same session — PawOS re-reads Machine+User environment straight from the registry (short-cached, not spawned fresh for every single check) rather than trusting its own long-running process’s stale in-memory environment, which would otherwise wrongly report "still not installed" immediately after a real fix.',
      },
      { type: 'heading', level: 2, id: 'verification-retry-failure', text: 'Verification, retry, and failure' },
      {
        type: 'paragraph',
        text: 'The same dual-shell (cmd.exe + PowerShell) version check used for software installation verifies a PATH fix. Failure and retry follow the same rules described on the Software Installation page.',
      },
      {
        type: 'status',
        status: 'implemented',
        text: 'Verified directly, non-destructively, in this documentation’s own preparation: a real installed tool (git) was checked in both a fresh PowerShell and a fresh cmd.exe process and correctly reported present in both — confirming the underlying detection mechanism behaves as described here.',
      },
    ],
    related: ['coding/software-installation', 'troubleshooting/path-problems'],
  },
  {
    section: 'coding',
    slug: 'testing-and-validation',
    title: 'Testing & Validation',
    description: 'The real syntax → build → test pipeline that runs after an edit batch.',
    blocks: [
      {
        type: 'lead',
        text: 'After a multi-file edit, PawOS can run a real validation pipeline: syntax → imports → typecheck → lint → build → tests, each step reporting a genuine passed/failed/skipped result.',
      },
      {
        type: 'paragraph',
        text: 'A step with nothing to check (no lint config, no test script) is honestly reported as skipped with a real reason — never fabricated as passed.',
      },
      { type: 'heading', level: 2, id: 'self-healing', text: 'Self-healing' },
      {
        type: 'paragraph',
        text: 'On a validation failure, PawOS can propose a targeted follow-up fix and re-validate, bounded to 3 attempts before honestly reporting the remaining failure.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'There is no visual/browser verification step in this pipeline yet — a change that breaks how a page renders without breaking a build or a test would not be caught here. See Visual Verification.',
      },
    ],
    related: ['coding/build-and-preview', 'coding/visual-verification', 'concepts/evidence'],
  },
  {
    section: 'coding',
    slug: 'build-and-preview',
    title: 'Build & Preview',
    description: 'Running a build and previewing it in a real, sandboxed browser.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS confirms a build passed by checking for a genuine output artifact, not just a zero exit code, and can open a real, locally-driven browser session scoped to localhost/your own deployment URL to preview the result.',
      },
      {
        type: 'note',
        text: 'The preview browser is deliberately restricted to localhost/127.0.0.1/a workspace’s own recorded deployment URL — it is never general web browsing.',
      },
    ],
    related: ['coding/testing-and-validation', 'coding/visual-verification'],
  },
  {
    section: 'coding',
    slug: 'visual-verification',
    title: 'Visual Verification',
    description: 'Screenshot-based UI verification — where it exists, and where it doesn’t.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS can capture and analyze a real screenshot of a rendered page to check for visible issues (broken layout, a missing image, a console error) when explicitly asked to verify a UI.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'This capability is not automatically wired into the coding validation pipeline (Testing & Validation) — it runs only when invoked directly, so an automatic build → test cycle will not catch a purely visual regression on its own today.',
      },
    ],
    related: ['coding/testing-and-validation', 'coding/build-and-preview'],
  },
  {
    section: 'coding',
    slug: 'work-records',
    title: 'Work Records',
    description: 'What a coding task’s Work Record actually contains.',
    blocks: [
      {
        type: 'lead',
        text: 'A coding task’s Work Record includes real command evidence (exit code, real output), real file evidence (what changed), and real validation evidence (per-step pass/fail) — see Core Concepts → Work Records for the full model.',
      },
      {
        type: 'status',
        status: 'partial',
        text: 'Software-installation and PATH-repair steps within a coding task currently only appear in the record’s generic timeline, not as their own structured evidence type the way commands and file edits are — a known, disclosed gap, not an oversight left undocumented.',
      },
    ],
    related: ['concepts/work-records', 'coding/software-installation'],
  },
];
