import type { HelpArticle } from '../HelpArticleTypes';

/**
 * Help Center articles for the Development category — the Coding Intelligence
 * Runtime (Paw Go / Paw Pro capability modes, the Coding Canvas, VS Code
 * launch, live code diff, the Error Timeline + ErrorMemoryStore, the
 * allowlisted terminal/process manager, and the build/test pipeline).
 */
export const DEVELOPMENT_ARTICLES: HelpArticle[] = [
  {
    id: 'ai-coding',
    category: 'development',
    title: 'AI Coding with Paw',
    summary:
      'How Paw plans, understands, and (in Paw Pro) writes and runs code in your projects — and the hard line between Paw Go and Paw Pro.',
    overview:
      'PawOS can act as a coding collaborator inside your own projects through the Coding Intelligence Runtime. This is controlled by a local capability toggle — Paw Go and Paw Pro — that is completely separate from your account subscription tier of the same name. Paw Go and Paw Pro here describe what Paw is allowed to *do* on your machine, not what you paid for. Paw Go is a read-only, analysis-first mode: Paw can understand your project structure, reason about dependencies and file impact, keep a running coding memory, and help you plan — but it cannot generate or edit a single line of code, write files, run git commands, or execute anything in a terminal. Paw Pro unlocks the rest: real code generation and editing, live diffs as changes happen, terminal and process execution, build and test automation, browser preview with console monitoring, an error timeline, and a bounded automatic build-run-test-fix loop that always stops to report back rather than looping forever or bypassing confirmation on anything destructive.',
    features: [
      'Local Paw Go / Paw Pro capability toggle, independent of your billing plan',
      'Paw Go: project understanding, dependency and file-impact analysis, read-only coding memory, planning',
      'Paw Pro: full code generation/editing, live diffs, terminal execution, build & test automation',
      'Minimal Change Philosophy system prompt: prefer editing existing code over creating new files, reuse existing architecture, touch the fewest files and lines necessary',
      'Bounded automatic build → run → test → fix loop (a few iterations max) that stops to report rather than looping indefinitely',
      'Every destructive or irreversible action (git operations, file writes, terminal commands) still passes through the normal confirmation gates even in Paw Pro',
      'Coding Canvas surfaces everything Paw is doing in real time so you are never guessing',
    ],
    howItWorks:
      'When you start a coding-related task, PawOS checks the current mode via the local CodingModeStore. In Paw Go, only read-only plugins are available (project analysis, file-impact analysis, memory lookups) — any request to write code or run a command is declined with an explanation, and you are told to switch to Paw Pro if you want Paw to actually make the change. In Paw Pro, the same request is routed to the full execution pipeline: Paw edits files, opens a terminal when needed, and can trigger a build/test cycle automatically. Every step it takes is reflected live in the Coding Canvas — nothing happens silently. You can switch modes at any time from the Development section or by asking Paw to switch; the switch is instant and local, with no account or billing check involved.',
    bestPractices: [
      'Start a new or unfamiliar project in Paw Go first, so Paw builds an accurate mental model before it starts editing anything',
      'Switch to Paw Pro only when you actually want files changed — treat it as "hands on the keyboard" mode',
      'Watch the Live TODO Progress and Live Code Diff panels in the Coding Canvas while Paw Pro works, rather than tabbing away',
      'Let the bounded fix loop finish its few iterations before intervening manually — it is designed to stop and report, not to run forever',
      'Keep task descriptions specific about which files or features are in scope — it helps the Minimal Change Philosophy keep edits tight',
    ],
    examples: [
      {
        title: 'Ask Paw to add a feature in Paw Pro',
        steps: [
          'Open the Development section and confirm the mode toggle shows Paw Pro (switch it if it currently shows Paw Go)',
          'Describe the feature you want in the conversation, referencing the project you want it applied to',
          'Watch the Coding Canvas open with Current Task and Live TODO Progress populated',
          'Review the Live Code Diff as Paw edits files',
          'When Paw reports the task complete, check the Build Status and Test Results panels before accepting the change',
        ],
      },
      {
        title: 'Use Paw Go to understand a codebase before changing anything',
        steps: [
          'Switch the mode toggle to Paw Go',
          'Ask Paw to explain the structure of a project or what would be affected if you changed a specific file',
          'Review the Project Understanding panel and the file-impact analysis Paw returns',
          'Once you have a plan, switch to Paw Pro and ask Paw to implement it',
        ],
      },
    ],
    troubleshooting: [
      'If Paw refuses to write code or run a command, check the mode toggle — it is almost always because you are still in Paw Go',
      'If a build/test loop stops after only a couple of attempts without a full fix, this is expected — the loop is intentionally bounded and will report what it tried instead of looping forever',
      'If Paw asks for confirmation before a git operation or command even in Paw Pro, that is the normal safety gate for destructive/irreversible actions, not a bug',
      'If the Coding Canvas seems out of date, confirm a coding task is actually active — the canvas only populates while Paw is working on one',
    ],
    requirements: [
      'A project opened in PawOS (Projects section)',
      'Paw Pro capability mode enabled for any action that writes files, runs commands, or builds/tests',
      'A configured AI provider for reasoning about code',
    ],
    permissions: [
      'File system read/write access scoped to the active project (Paw Pro only)',
      'Local command execution via the allowlisted terminal (Paw Pro only)',
      'Confirmation is requested before destructive actions such as git operations that rewrite history or delete files',
    ],
    faq: [
      {
        question: 'Is Paw Pro (coding mode) the same as the Pro subscription plan?',
        answer:
          'No. Paw Go/Paw Pro here is a local, free capability toggle that controls what Paw is allowed to do in your projects. It has no connection to your account subscription tier, which is billed separately and covers different things entirely.',
      },
      {
        question: 'Can Paw Go write any code at all?',
        answer:
          'No. Paw Go is strictly read-only — it can analyze, plan, and explain, but it cannot generate or edit code, write files, run git commands, or execute anything.',
      },
      {
        question: 'What stops Paw Pro from looping forever trying to fix a bug?',
        answer:
          'The automatic build-run-test-fix loop is bounded to a small number of iterations. When it hits the limit without success, it stops and reports what it tried rather than continuing indefinitely.',
      },
      {
        question: 'Does Paw Pro bypass confirmation for risky actions?',
        answer:
          'No. Destructive or irreversible actions — certain git operations, deleting files, and similar — still require your confirmation even in Paw Pro.',
      },
      {
        question: 'What is the Minimal Change Philosophy?',
        answer:
          'It is a system prompt principle that biases Paw toward editing existing code rather than creating new files, reusing existing architecture, and touching the fewest files and lines necessary to complete a task.',
      },
      {
        question: 'Where do I switch between Paw Go and Paw Pro?',
        answer:
          'From the Development section\'s mode toggle, or by simply asking Paw in conversation to switch modes.',
      },
    ],
    relatedArticleIds: [
      'coding-canvas-vscode-integration',
      'code-review',
      'debugging',
      'terminal',
      'build-system',
    ],
    relatedSettings: ['General', 'Advanced'],
    relatedApps: ['development', 'projects'],
    keywords: [
      'Paw Go',
      'Paw Pro',
      'coding mode',
      'Coding Intelligence Runtime',
      'Coding Canvas',
      'Minimal Change Philosophy',
      'AI coding',
      'code generation',
    ],
    aliases: ['AI Coding', 'Coding Mode', 'Paw Go/Pro'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 5,
  },
  {
    id: 'coding-canvas-vscode-integration',
    category: 'development',
    title: 'VS Code Integration',
    summary: 'Launching VS Code directly at a project from PawOS.',
    overview:
      'PawOS can open Visual Studio Code for you at the exact path of the project you are working in, so you can jump from a conversation with Paw straight into your editor without hunting for the folder yourself. This is a real "open app" action wired into the execution engine — it launches the VS Code executable on your machine with the project directory as an argument.',
    features: [
      'Open VS Code at a specific project path directly from a Paw conversation or the Projects section',
      'Works alongside the Coding Canvas — you can have Paw editing files in Paw Pro while you also inspect them yourself in VS Code',
      'No special configuration beyond having VS Code installed and available on your system',
    ],
    howItWorks:
      'When you ask Paw to open a project in VS Code, or trigger the action from the Projects section, PawOS resolves the project\'s root path and launches VS Code with that path as the target folder, the same way running `code <path>` from a terminal would. This is a one-way launch action — PawOS does not read from or control VS Code once it is open; it simply gets you there faster.',
    bestPractices: [
      'Use it as a quick jump-off point after Paw finishes a Paw Pro task, to review the diff in your own editor',
      'Keep VS Code\'s command-line launcher (`code`) available on your PATH so the launch action resolves reliably',
    ],
    examples: [
      {
        title: 'Open the active project in VS Code',
        steps: [
          'Open the Projects section and select the project you are working on',
          'Trigger the "Open in VS Code" action from the project card, or ask Paw to open the project in VS Code',
          'VS Code launches with that project folder as the workspace root',
        ],
      },
    ],
    troubleshooting: [
      'If VS Code does not launch, confirm it is installed and that its command-line launcher is on your system PATH',
      'This action only opens the editor — it does not install VS Code for you if it is missing',
    ],
    requirements: ['Visual Studio Code installed locally', 'A project already open in PawOS'],
    permissions: ['Launching an external application (VS Code) on your machine'],
    faq: [
      {
        question: 'Does PawOS install VS Code for me?',
        answer: 'No. PawOS launches VS Code if it is already installed — it does not install or update it.',
      },
      {
        question: 'Can Paw see what I do inside VS Code once it opens?',
        answer:
          'No. The integration is a one-way launch action. PawOS does not read from or control VS Code after opening it.',
      },
      {
        question: 'Does this work with editors other than VS Code?',
        answer: 'Today the built-in "open app" action targets VS Code specifically.',
      },
    ],
    relatedArticleIds: ['ai-coding', 'code-review', 'terminal'],
    relatedSettings: ['General'],
    relatedApps: ['development', 'projects'],
    keywords: ['VS Code', 'Visual Studio Code', 'open app', 'editor integration'],
    aliases: ['Open in VS Code', 'VS Code'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'code-review',
    category: 'development',
    title: 'Code Review & Live Diffs',
    summary: 'Real, line-accurate code diffs surfaced in the Coding Canvas and Task Cards as Paw makes changes.',
    overview:
      'Whenever Paw Pro edits your project, PawOS shows you exactly what changed by running `git diff --numstat` and parsing the real added/removed line counts per file — not an estimate or a fabricated summary. This appears live in the Coding Canvas\'s Live Code Diff panel while work is in progress, and is also attached to the relevant Task Card so you can review it after the fact.',
    features: [
      'Real per-file added/removed line counts parsed from `git diff --numstat`',
      'Live Code Diff panel in the Coding Canvas updates as Paw Pro makes changes',
      'Diff summaries attached to Task Cards for after-the-fact review',
      'No fabricated or estimated diff data — if git cannot produce a diff, none is shown',
    ],
    howItWorks:
      'After Paw Pro modifies files as part of a task, PawOS runs `git diff --numstat` against the project\'s working tree and parses the output into a per-file list of lines added and removed. This is surfaced immediately in the Live Code Diff section of the Coding Canvas, and a snapshot of it is retained on the Task Card for that task so you can scroll back and see what changed without re-running git yourself.',
    bestPractices: [
      'Review the Live Code Diff before accepting a Paw Pro task as complete, especially for changes touching multiple files',
      'Use the diff to confirm the Minimal Change Philosophy held — that Paw touched only the files relevant to your request',
      'Keep the project under git version control so diffs can actually be computed',
    ],
    examples: [
      {
        title: 'Review what Paw changed after a task',
        steps: [
          'Complete a Paw Pro coding task',
          'Open the relevant Task Card in the conversation',
          'Expand the code diff summary to see per-file added/removed line counts',
          'Cross-check against the Coding Canvas\'s Live Code Diff panel for the same task',
        ],
      },
    ],
    troubleshooting: [
      'If no diff appears, confirm the project is a git repository — diffs are computed from `git diff --numstat` and require git to be present and initialized',
      'A file showing 0/0 changes typically means it was touched but content did not change (e.g. permissions/formatting no-op), not a bug',
    ],
    requirements: ['Project must be a git repository', 'git installed and available on PATH', 'Paw Pro capability mode for edits to occur'],
    permissions: ['Read access to the project\'s git history/working tree to compute diffs'],
    faq: [
      {
        question: 'Are the diff numbers estimated by the AI?',
        answer:
          'No. They come directly from parsing real `git diff --numstat` output, not from anything the model guesses at.',
      },
      {
        question: 'What happens if my project is not a git repository?',
        answer: 'No diff can be computed, so the Live Code Diff panel will simply show nothing for that project.',
      },
      {
        question: 'Can I see the diff after the task is finished, not just live?',
        answer: 'Yes — a snapshot of the diff is attached to the Task Card for that task so you can review it later.',
      },
    ],
    relatedArticleIds: ['ai-coding', 'debugging', 'build-system'],
    relatedSettings: ['Advanced'],
    relatedApps: ['development'],
    keywords: ['code diff', 'git diff', 'live diff', 'code review', 'numstat'],
    aliases: ['Live Code Diff', 'Diff Review'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'debugging',
    category: 'development',
    title: 'Debugging with the Error Timeline & Coding Memory',
    summary: 'A chronological Error Timeline plus a searchable memory of previously fixed bugs, so Paw avoids repeating past mistakes.',
    overview:
      'PawOS aggregates real errors as they happen — stderr output and non-zero exit codes from running processes, plus console errors captured from the dev browser preview — into a single chronological Error Timeline inside the Coding Canvas. Separately, an ErrorMemoryStore records genuine fixed-bug entries (the problem, its cause, and the solution that worked) whenever Paw resolves something. Before attempting a fresh fix on a similar-looking problem, Paw searches that memory using word-overlap scoring against past entries, so it can lean on what already worked instead of guessing from scratch each time.',
    features: [
      'Chronological Error Timeline aggregating process stderr, non-zero exit codes, and dev-browser console errors',
      'ErrorMemoryStore records real problem/cause/solution entries for bugs Paw has actually fixed',
      'Word-overlap search against past fixes before attempting a new one on a similar problem',
      'All entries are grounded in real execution output — nothing in the timeline or memory is fabricated',
    ],
    howItWorks:
      'As processes run under the ProcessManager, any stderr output or non-zero exit is captured and appended to the Error Timeline with a timestamp. If a dev browser preview is active, console errors from that preview are merged into the same timeline. When Paw is asked to fix a bug, it first queries the ErrorMemoryStore, scoring stored problem descriptions against the current one by word overlap, and surfaces the closest matches (if any) before working the problem fresh. Once a fix is confirmed to work, a new entry — problem, cause, solution — is written back to the store for future reuse.',
    bestPractices: [
      'Let a failing process or build run to completion so its full stderr output reaches the Error Timeline',
      'When Paw references a past fix from memory, double check it actually applies to your current situation before accepting it wholesale',
      'Keep the dev browser preview open during frontend debugging so console errors feed into the same timeline as backend errors',
    ],
    examples: [
      {
        title: 'Debug a failing process using the Error Timeline',
        steps: [
          'Start or run the failing process from the Terminal/Processes panel',
          'Open the Coding Canvas and check the Error Timeline for the captured stderr/exit-code entry',
          'Ask Paw to investigate the error shown in the timeline',
          'Review whether Paw surfaces a similar past fix from the ErrorMemoryStore before proposing a new one',
        ],
      },
    ],
    troubleshooting: [
      'If an error does not appear in the timeline, confirm the process actually exited non-zero or wrote to stderr — successful runs are not logged as errors',
      'If Paw does not find a similar past fix, that is expected the first time a particular kind of bug occurs — nothing is pre-seeded in the ErrorMemoryStore',
    ],
    requirements: ['Paw Pro capability mode for process execution and fixes', 'A running or recently-run process, or an active dev browser preview'],
    permissions: ['Reading process output (stdout/stderr) and dev-browser console output'],
    faq: [
      {
        question: 'Does the Error Timeline include frontend console errors, or only backend process errors?',
        answer: 'Both — it merges stderr/non-zero exits from running processes with console errors captured from the dev browser preview into one chronological view.',
      },
      {
        question: 'Is the "similar past fix" feature a general AI debugging claim, or something concrete?',
        answer:
          'It is concrete: fixed-bug entries with a real problem, cause, and solution are stored in the ErrorMemoryStore and searched by word-overlap scoring — it is not a vague AI capability claim.',
      },
      {
        question: 'Does the timeline show errors from projects other than the current one?',
        answer: 'The timeline reflects processes and previews associated with your current session and active project context.',
      },
    ],
    relatedArticleIds: ['ai-coding', 'terminal', 'build-system', 'code-review'],
    relatedSettings: ['Advanced'],
    relatedApps: ['development'],
    keywords: ['debugging', 'Error Timeline', 'ErrorMemoryStore', 'stderr', 'console errors', 'bug fixing'],
    aliases: ['Error Timeline', 'Debug Assistant'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'terminal',
    category: 'development',
    title: 'Terminal & Process Management',
    summary: 'An allowlisted terminal for running commands, plus a process manager for long-running processes — with independently expandable output.',
    overview:
      'PawOS gives Paw Pro a real, but bounded, terminal capability. Commands are run through an allowlisted RunCommandPlugin covering common tools like npm, git, node, and python, with your shell of choice configurable — this is not an open shell that can run anything. Long-running processes (dev servers, watchers, and similar) are managed by a ProcessManager that can start, stop, and list them, and captures their output in a ring buffer so recent output is always available without unbounded memory growth. Terminal output shown in a Task Card can be expanded independently, so a long command\'s output does not crowd out the rest of the conversation.',
    features: [
      'Allowlisted command execution (npm, git, node, python, and similar common tools)',
      'Configurable shell selection',
      'ProcessManager for starting, stopping, and listing long-running processes',
      'Ring-buffer output capture per process, so recent output is retained without unbounded growth',
      'Independently expandable terminal output within Task Cards',
    ],
    howItWorks:
      'When a command needs to run, RunCommandPlugin checks it against the allowlist before executing it in the configured shell; anything outside the allowlist is refused rather than run blind. Commands intended to keep running (like a dev server) are handed to the ProcessManager, which tracks their lifecycle and streams output into a fixed-size ring buffer per process — you can list running processes, stop one, or check its recent output at any time. Wherever this output surfaces in a Task Card, it is rendered in a collapsed-by-default panel that you can expand independently of the rest of the card.',
    bestPractices: [
      'Use the process list to check what is already running before starting a duplicate dev server',
      'Stop long-running processes you no longer need rather than leaving them running in the background',
      'If a command you need is not on the allowlist, run it yourself outside PawOS rather than trying to work around the restriction',
    ],
    examples: [
      {
        title: 'Start and monitor a dev server',
        steps: [
          'Ask Paw (in Paw Pro) to start the project\'s dev server',
          'Confirm it appears in the Running Processes panel of the Coding Canvas',
          'Expand the Terminal Output panel in the Task Card to see live output',
          'Ask Paw to stop the process when you are done, or stop it from the Running Processes list',
        ],
      },
    ],
    troubleshooting: [
      'If a command is refused, it is likely not on the allowlist — this is by design, not a bug',
      'If a long-running process seems to have stopped producing output, check the process list to confirm it is still running rather than assuming the ring buffer dropped data',
      'Terminal execution requires Paw Pro — in Paw Go, commands are declined entirely',
    ],
    requirements: ['Paw Pro capability mode', 'The relevant CLI tools (npm, git, node, python, etc.) installed locally for the commands you want to run'],
    permissions: ['Local command execution, restricted to an allowlist of common development tools', 'Starting and stopping local processes'],
    faq: [
      {
        question: 'Can Paw run any shell command it wants?',
        answer: 'No. Commands are checked against an allowlist covering common tools like npm, git, node, and python — anything outside that list is refused.',
      },
      {
        question: 'What shell does PawOS use to run commands?',
        answer: 'A configurable shell that you select — it is not hardcoded to one shell.',
      },
      {
        question: 'Does terminal output get cut off for long-running processes?',
        answer: 'Output is captured in a ring buffer per process, so the most recent output is retained without letting memory grow without bound.',
      },
      {
        question: 'Can I run terminal commands in Paw Go?',
        answer: 'No. Terminal execution is a Paw Pro-only capability; Paw Go is read-only and cannot run commands.',
      },
    ],
    relatedArticleIds: ['ai-coding', 'build-system', 'debugging'],
    relatedSettings: ['Advanced'],
    relatedApps: ['development'],
    keywords: ['terminal', 'shell', 'RunCommandPlugin', 'ProcessManager', 'allowlist', 'process management'],
    aliases: ['Terminal', 'Shell', 'Processes'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'build-system',
    category: 'development',
    title: 'Build System & Test Results',
    summary: 'Real build status and best-effort, honestly-scoped test result parsing — never fabricated pass/fail counts.',
    overview:
      'PawOS can build and test your project through Paw Pro. BuildProjectPlugin runs your project\'s build and returns the real status and metadata from that run — it does not fabricate a pass/fail beyond what the build tool actually reported. Test results are handled by a TestResultParser that recognizes summary output from common test runners (Jest, Vitest, pytest, mocha) and extracts real pass/fail/skip counts when it can. When the output does not match a recognized format, it honestly falls back to reporting only the exit code status rather than inventing numbers it cannot verify.',
    features: [
      'Real build execution and status reporting via BuildProjectPlugin',
      'Best-effort test summary parsing for Jest, Vitest, pytest, and mocha output formats',
      'Honest fallback to exit-code-only status when no recognized test summary is found — no invented pass/fail counts',
      'Build Status and Test Results panels in the Coding Canvas',
      'Feeds into the bounded automatic build → run → test → fix loop in Paw Pro',
    ],
    howItWorks:
      'When a build is triggered, BuildProjectPlugin runs the project\'s configured build command and reports back the real outcome and any relevant metadata from that run. For tests, the TestResultParser scans the test runner\'s output for summary lines it recognizes (for example, Jest\'s or Vitest\'s pass/fail/total line, pytest\'s summary, or mocha\'s reporter output) and extracts structured counts from them. If the output does not match any of the patterns it knows, the parser does not guess — it reports the exit code (pass/fail) alone rather than presenting fabricated numbers. Both results are shown live in the Coding Canvas and can trigger the automatic fix loop in Paw Pro when a build or test fails.',
    bestPractices: [
      'Use a test runner from the recognized list (Jest, Vitest, pytest, mocha) if you want structured pass/fail/skip counts rather than exit-code-only status',
      'Treat an exit-code-only test result as informative but less detailed — it means the parser could not confidently extract counts, not that something is broken',
      'Review the Build Status panel after any Paw Pro change that touches build configuration',
    ],
    examples: [
      {
        title: 'Run a build and tests after a change',
        steps: [
          'After Paw Pro finishes editing files, ask it to build the project',
          'Check the Build Status panel in the Coding Canvas for the real outcome',
          'Ask Paw to run the test suite',
          'Review the Test Results panel — structured counts if a recognized runner\'s summary was found, or exit-code status otherwise',
        ],
      },
    ],
    troubleshooting: [
      'If test results show only pass/fail with no counts, your test runner\'s output format was not one of the recognized summaries (Jest/Vitest/pytest/mocha) — this is an honest fallback, not a bug',
      'If a build fails, check the Build Status panel for the real error output from the build tool rather than assuming a generic failure reason',
      'The automatic fix loop only retries a bounded number of times — if it stops without success, review the reported attempts and continue manually',
    ],
    requirements: ['Paw Pro capability mode', 'A configured build command for the project', 'A test runner installed if you want automated test results'],
    permissions: ['Local command execution for build and test commands'],
    faq: [
      {
        question: 'Does PawOS ever make up test pass/fail counts?',
        answer: 'No. If the TestResultParser cannot recognize the test runner\'s summary format, it reports exit-code-only status instead of inventing numbers.',
      },
      {
        question: 'Which test runners get full structured results?',
        answer: 'Jest, Vitest, pytest, and mocha are the currently recognized summary formats.',
      },
      {
        question: 'What happens if a build fails during the automatic fix loop?',
        answer: 'Paw Pro will attempt a fix and retry, but only for a bounded number of iterations before stopping to report what it tried.',
      },
    ],
    relatedArticleIds: ['ai-coding', 'terminal', 'debugging', 'code-review'],
    relatedSettings: ['Advanced'],
    relatedApps: ['development'],
    keywords: ['build system', 'BuildProjectPlugin', 'TestResultParser', 'Jest', 'Vitest', 'pytest', 'mocha', 'test results'],
    aliases: ['Build & Test', 'Build Status', 'Test Results'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
];
