import type { HelpArticle } from '../HelpArticleTypes';

export const PROJECTS_ARTICLES: HelpArticle[] = [
  {
    id: 'creating-projects',
    category: 'projects',
    title: 'Creating Projects',
    summary: 'Starting a brand-new project folder from inside PawOS.',
    overview:
      'Creating a project means creating a new folder on disk through PawOS and opening it in the Projects ' +
      'section. Projects in PawOS are always real folders on your filesystem — nothing is invented or tracked ' +
      'without a real folder behind it.',
    features: ['Create a new folder directly from Projects', 'The new folder is immediately analyzed like any imported project'],
    howItWorks:
      'From Projects, choose to create a new folder, name it, and pick a location. PawOS creates the folder ' +
      'and adds it to your Projects list, running the same real analysis (framework, language, git status) ' +
      'that importing an existing folder does.',
    bestPractices: ['Create the project in a location you’ll remember — PawOS reflects real folders, it does not manage a separate hidden project store'],
    examples: [
      { title: 'Starting a new project', steps: ['Open Projects', 'Choose "Create new project"', 'Name the folder and pick a location', 'Confirm — the folder is created and opened'] },
    ],
    troubleshooting: ['If the create action fails, check that you have write permission to the chosen location'],
    requirements: ['Write access to the chosen folder location'],
    permissions: ['File system access to create the folder'],
    relatedArticleIds: ['importing-projects', 'workspaces', 'git-repositories'],
    relatedSettings: [],
    relatedApps: ['projects'],
    faq: [{ question: 'Does creating a project initialize git automatically?', answer: 'A new folder starts as a plain, non-git folder — you initialize or clone git separately through the real git tooling.' }],
    keywords: ['create project', 'new project', 'new folder'],
    aliases: ['Create new project'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'importing-projects',
    category: 'projects',
    title: 'Importing Projects',
    summary: 'Bringing an existing folder into PawOS’s Projects section.',
    overview:
      'Importing opens an existing folder on your disk and adds it to Projects. PawOS then runs a real, flat ' +
      'analysis of it — detecting the framework, language, build tool, and git status — rather than a deep ' +
      'dependency graph.',
    features: ['Open any existing folder as a project', 'Automatic detection of framework, language, build tool, and git status'],
    howItWorks: 'Choose "Import" in Projects and select a folder. PawOS reads package.json and other real project files to identify what kind of project it is, and reflects that honestly in the Projects list.',
    bestPractices: ['Import the top-level folder of your project (where package.json or the equivalent lives) for the most accurate detection'],
    examples: [{ title: 'Importing an existing repository', steps: ['Open Projects', 'Choose "Import"', 'Select the folder', 'Review the detected framework/language/git status'] }],
    troubleshooting: ['If detection looks wrong, confirm you imported the actual project root, not a subfolder'],
    requirements: [],
    permissions: ['File system access to read the selected folder'],
    relatedArticleIds: ['creating-projects', 'workspaces', 'git-repositories'],
    relatedSettings: [],
    relatedApps: ['projects'],
    faq: [{ question: 'Can I import a project that isn’t on git?', answer: 'Yes — git status detection simply reports "not a git repository" honestly rather than failing.' }],
    keywords: ['import project', 'open folder', 'project analyzer'],
    aliases: ['Import project', 'Open folder'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'git-repositories',
    category: 'projects',
    title: 'Git Repositories',
    summary: 'Real git operations available from inside a project — reading and writing.',
    overview:
      'PawOS includes a real git write runtime (add, commit, create branch, checkout) alongside read-only git ' +
      'plugins (status, log, diff) and a diff-stat plugin that reports real added/deleted line counts via ' +
      '`git diff --numstat`. Every destructive git operation goes through a confirm-then-retry gate before it runs.',
    features: [
      'Add, commit, create branch, and checkout — real git write operations',
      'Read-only status, log, and diff',
      'Live +/- line-count diff stats',
      'Confirmation required before any commit or checkout',
    ],
    howItWorks:
      'Git operations are exposed as plugins the reasoning runtime can call, or that you trigger directly from ' +
      'the Coding Canvas. Every write operation describes what it’s about to do and waits for your confirmation ' +
      'before touching your repository.',
    bestPractices: ['Review the described change before confirming a commit or checkout', 'Use the read-only diff/status plugins to check state before committing'],
    examples: [
      { title: 'Clone, review, and commit', steps: ['Import or open a git repository as a project', 'Ask for a real diff-stat to see current changes', 'Stage and commit the change', 'Confirm the commit when prompted'] },
    ],
    troubleshooting: ['If a commit or checkout seems stuck, check for a pending confirmation prompt', 'If diff stats show "not a git repository", the folder was not actually a git repo'],
    requirements: ['git installed and available on your system'],
    permissions: ['Confirmation is required before commit, checkout, or branch creation'],
    administration: 'No org-level git policy exists — every user’s local confirmation gate is the only control today.',
    relatedArticleIds: ['importing-projects', 'code-review', 'workspaces'],
    relatedSettings: ['Advanced'],
    relatedApps: ['projects', 'development'],
    faq: [
      { question: 'Can PawOS push to a remote?', answer: 'Git tooling today covers add/commit/branch/checkout and read-only inspection; push/remote operations are not part of the current plugin set.' },
      { question: 'Will PawOS ever commit without asking?', answer: 'No — commit and checkout always require your explicit confirmation first.' },
    ],
    keywords: ['git', 'git repository', 'commit', 'branch', 'checkout', 'diff', 'git diff --numstat'],
    aliases: ['Git', 'Commit', 'Checkout', 'Create branch'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'workspaces',
    category: 'projects',
    title: 'Workspaces',
    summary: 'The persistent workspace memory and live Coding Canvas behind each project.',
    overview:
      'Each project you work in has a persistent WorkspaceMemoryStore tracking real facts about it over time. ' +
      'When a coding task is active, PawOS shows a live "Coding Canvas" with 12 real, always-visible sections: ' +
      'Project Understanding, Current Task, Live TODO Progress, Running Processes, Terminal Output, Live Code ' +
      'Diff, Build Status, Test Results, Browser Preview, Browser Console, Error Timeline, and Coding Memory.',
    features: [
      'Persistent per-workspace memory',
      'A 12-section live Coding Canvas during active coding tasks',
      'Gated by a local Paw Go (planning/read-only) vs Paw Pro (full execution) mode',
    ],
    howItWorks:
      'As you work in a project, facts (framework, git state, past tasks) accumulate in its workspace memory. ' +
      'Starting a coding task surfaces the Coding Canvas, which fills in with real data section by section as ' +
      'the task progresses — never fabricated placeholders once real data exists.',
    bestPractices: ['Switch to Paw Pro mode when you actually want PawOS to execute commands/builds, not just plan'],
    examples: [],
    troubleshooting: ['If the Coding Canvas shows "Paw Go — read-only" for execution sections, switch to Paw Pro mode to unlock them'],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['ai-coding', 'history', 'git-repositories'],
    relatedSettings: ['Advanced'],
    relatedApps: ['projects', 'development'],
    faq: [{ question: 'What’s the difference between Paw Go and Paw Pro?', answer: 'Paw Go allows planning, analysis, and read-only inspection only; Paw Pro adds full code generation, file writes, terminal execution, and build/test automation.' }],
    keywords: ['workspace', 'coding canvas', 'paw go', 'paw pro', 'workspace memory'],
    aliases: ['Coding Canvas', 'Workspace memory'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'history',
    category: 'projects',
    title: 'History',
    summary: 'The real, persistent record of every task PawOS has performed on your projects.',
    overview:
      'Every action taken — commands run, files changed, builds attempted — is recorded in a persistent ' +
      'ExecutionMemoryStore and shown in the real, read-only Work History page. This is the ground truth for ' +
      'what actually happened, not a summarized or fabricated log.',
    features: ['A persistent record of every executed task', 'A dedicated Work History dashboard page, read-only and accurate'],
    howItWorks: 'Every task the execution engine runs is recorded with its real outcome (done, failed, etc.). Work History lists these in order, so you can always check exactly what PawOS did and when.',
    bestPractices: ['Check Work History whenever you’re unsure whether an action actually completed'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['workspaces', 'git-repositories', 'debugging'],
    relatedSettings: [],
    relatedApps: ['workHistory', 'projects'],
    faq: [{ question: 'Can Work History entries be edited or hidden?', answer: 'It is a read-only, honest log of what happened — it is not curated or editable.' }],
    keywords: ['history', 'work history', 'execution history'],
    aliases: ['Work History'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'backups',
    category: 'projects',
    title: 'Backups',
    summary: 'What real backup options exist for your project work today.',
    overview:
      'PawOS does not have a dedicated "back up my project" feature. The two real backup mechanisms today ' +
      'are: git itself (your project’s own commit history, if it’s a git repository) and the separate ' +
      'Companion Package (.paw) export, which backs up a companion (appearance/voice/memory), not your project ' +
      'files.',
    features: ['Git commit history as your project’s real version history', 'Companion Package (.paw) export/import for companion backup — separate from project files'],
    howItWorks: 'For project files, rely on committing to git regularly — that is PawOS’s real, current safety net. For a companion, use Export in Companion Studio.',
    bestPractices: ['Commit meaningful project changes to git regularly rather than relying on an in-app backup feature that does not exist yet'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['git-repositories', 'companion-studio', 'history'],
    relatedSettings: [],
    relatedApps: ['projects', 'companionLab'],
    faq: [{ question: 'Does PawOS back up my project folder automatically?', answer: 'No — there is no automatic project-backup feature today. Use git commits for project version history.' }],
    keywords: ['backup', 'backups', 'project backup'],
    aliases: ['Backup', 'Restore'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
