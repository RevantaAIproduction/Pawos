import type { DocPage } from '../types';

export const gettingStartedPages: DocPage[] = [
  {
    section: 'getting-started',
    slug: 'introduction',
    title: 'Introduction',
    description: 'What PawOS is, what it isn\u2019t, and how these docs are organized.',
    keywords: ['what is pawos', 'overview'],
    blocks: [
      {
        type: 'lead',
        text: 'PawOS is an AI Development Operating System with three product experiences: PawOS Desktop, PawOS CLI, and PawOS Web. They share a PawOS account but have different execution boundaries and capabilities.',
      },
      {
        type: 'paragraph',
        text: 'PawOS Web is the browser-based experience for chat and GitHub-based work. PawOS Desktop is the Windows local development companion. PawOS CLI is an independently installed terminal coding agent that works in the folder where it is started, including non-Git projects. Local CLI work does not require the Desktop app or a Web installation; account sign-in may use a browser authorization handoff.',
      },
      { type: 'heading', level: 2, id: 'how-it-works', text: 'How it works, at a glance' },
      {
        type: 'paragraph',
        text: 'PawOS turns what you ask for into concrete, checked actions, carries them out on your machine, and records what actually happened as evidence \u2014 not a summary written after the fact.',
      },
      {
        type: 'list',
        items: [
          'Reasoning is model-driven; execution is deterministic code, not the model directly touching your machine.',
          'Anything destructive (writing files, running installers, modifying PATH, deploying) requires an explicit confirmation before it runs.',
          'Every completed request produces a Work Record \u2014 real evidence of what ran, what changed, and what was verified.',
        ],
      },
      { type: 'heading', level: 2, id: 'how-these-docs-are-organized', text: 'How these docs are organized' },
      {
        type: 'table',
        headers: ['Section', 'What it covers'],
        rows: [
          ['Getting Started', 'Choose Web, Desktop or CLI; installation, first run, workspace and coding task'],
          ['Core Concepts', 'The vocabulary every other section assumes \u2014 Workspaces, Work Records, Plans, Evidence, Entitlements'],
          ['Coding', 'The Coding Runtime: project understanding, editing, terminal, software installation, validation'],
          ['Autonomous Work', 'Unattended ticket resolution \u2014 eligibility, connectors, permissions, billing'],
          ['Connectors', 'Real, currently-supported third-party integrations'],
          ['Companion / Mobile', 'The 3D desktop companion and PawOS on a paired phone'],
          ['Billing & Usage', 'Plans, Paw Compute, Autonomous Work Credits, payments'],
          ['Security & Permissions', 'What PawOS can and can\u2019t do without asking, and why'],
          ['Troubleshooting', 'Symptom-first fixes for common problems'],
          ['Developer / Reference', 'Internal architecture, for engineers building on or contributing to PawOS'],
        ],
      },
      {
        type: 'note',
        text: 'This documentation only describes what is actually implemented today. Where a capability is partial or unverified, the page says so explicitly rather than describing an aspiration as if it already works.',
      },
      { type: 'heading', level: 2, id: 'first-10-minutes', text: 'Your first 10 minutes with PawOS' },
      {
        type: 'steps',
        items: [
          { title: 'Choose where the work should run', detail: 'Use Web for browser-based chat and supported GitHub work, CLI for terminal-based local project work, and Desktop for Windows local development and Desktop-specific runtimes. Phone access is Web in a mobile browser or a paired view of Desktop.' },
          { title: 'Think in tasks', detail: 'Ask for outcomes: "explain this repo", "add dark mode", "run the tests", or "prepare this ticket." PawOS groups each request into a task with its own evidence.' },
          { title: 'Select a workspace', detail: 'For coding and file work, point PawOS at an explicit folder. That folder becomes the normal filesystem and command boundary for the task.' },
          { title: 'Use read-only questions first', detail: 'Ask what the project does, what framework it uses, or which files a feature might touch. Project understanding is available before execution.' },
          { title: 'Review plans before mutation', detail: 'For non-trivial coding edits, PawOS can show a visual Plan Review card before changes are applied.' },
          { title: 'Approve deliberately', detail: 'Plan approval is not the same as authorizing every destructive action. PawOS still asks before real edits, commands, installs, PATH changes, git writes, or deploys.' },
          { title: 'Check the Work Record', detail: 'After a task, open the evidence trail: what ran, what changed, what passed, what failed, and what was not verified.' },
        ],
      },
      {
        type: 'table',
        headers: ['Term', 'How to think about it'],
        rows: [
          ['Workspace', 'The explicit local folder PawOS can inspect and, when authorized, change.'],
          ['Runtime', 'A capability area such as Coding, Browser, Office, Communication, or Autonomous Work.'],
          ['Task', 'One user request plus its action timeline and final evidence.'],
          ['Work Record', 'The structured trace of a task: commands, file changes, validation, screenshots, failures, and final report.'],
          ['Plan', 'A structured review artifact, usually file-by-file, produced before mutation.'],
          ['Paw Compute', 'The product usage meter; current conversion and account limits are shown in billing settings.'],
          ['Autonomous Work Credits', 'A separate dollar wallet used only for successful Autonomous Ticket completions.'],
        ],
      },
    ],
    related: ['getting-started/installation', 'getting-started/quickstart', 'concepts/workspaces'],
  },
  {
    section: 'getting-started',
    slug: 'installation',
    title: 'Installation',
    description: 'How to install PawOS for Windows.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS Desktop is a self-contained app for Windows only, installed from the Microsoft Store \u2014 nothing else needs to be installed first.',
      },
      {
        type: 'steps',
        items: [
          { title: 'Get PawOS from the Microsoft Store', detail: 'Open the PawOS listing in the Microsoft Store and choose Get or Install. On this site, Download for Windows asks you to request early access, and the email you receive links to the same Microsoft Store listing.' },
          { title: 'Let the Store install it', detail: 'The Microsoft Store downloads and installs PawOS for you. There is no separate installer file to run.' },
          { title: 'Sign in', detail: 'Open PawOS and sign in. Workspace and system permissions are requested only when a task needs them.' },
        ],
      },
      {
        type: 'cta',
        text: 'PawOS Desktop for Windows is installed from the Microsoft Store.',
        label: 'Get PawOS Desktop for Windows',
        href: 'https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN',
      },
      {
        type: 'warning',
        text: 'Only install PawOS from its Microsoft Store listing.',
      },
      {
        type: 'note',
        text: 'The repository’s existing Desktop 1.0.4 MSIX is unsigned, has no matching WACK report or verified source provenance, and has not passed disposable-environment installation/runtime testing. It is not certified or ready for Partner Center. This local artifact does not establish which version, if any, the separate Store listing currently serves.',
      },
      { type: 'heading', level: 2, id: 'first-launch', text: 'First launch' },
      {
        type: 'paragraph',
        text: 'On first launch you\u2019ll be asked to sign in (Paw Go, the free tier, requires only an account) and grant OS-level permissions PawOS needs for its companion overlay and, if you use voice, microphone access.',
      },
      {
        type: 'faq',
        items: [
          { q: 'What if launch fails?', a: 'Make sure you installed PawOS from the Microsoft Store, that Windows allowed the app to run, and see Troubleshooting \u2192 PawOS won\u2019t start.' },
          { q: 'Do I need anything else installed first?', a: 'No — the PawOS installer includes everything the app needs.' },
        ],
      },
    ],
    related: ['getting-started/system-requirements', 'getting-started/quickstart'],
  },
  {
    section: 'getting-started',
    slug: 'system-requirements',
    title: 'System Requirements',
    description: 'What you need for PawOS Desktop on Windows, and for PawOS Web on a computer or phone.',
    keywords: ['requirements', 'windows', 'macos', 'mac', 'linux', 'supported platforms', 'browser', 'phone', 'node'],
    blocks: [
      {
        type: 'lead',
        text: 'PawOS Desktop is for Windows only, and is installed from the Microsoft Store. PawOS Web runs in a browser on any computer or phone, with nothing to install.',
      },
      { type: 'heading', level: 2, id: 'desktop', text: 'PawOS Desktop (Windows only)' },
      {
        type: 'table',
        headers: ['', 'Requirement'],
        rows: [
          ['Operating system', 'Windows 10 (64-bit) or later'],
          ['Memory', '4\u202fGB RAM minimum (8\u202fGB recommended)'],
          ['Install from', 'The Microsoft Store'],
        ],
      },
      {
        type: 'note',
        text: 'A graphics card with 3D acceleration is recommended for smooth companion animation \u2014 PawOS still runs without one, with reduced animation quality.',
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'PawOS Desktop is not currently available for macOS or Linux. On a Mac or a Linux computer you can use PawOS Web in your browser, and the PawOS CLI in your terminal.',
      },
      { type: 'heading', level: 2, id: 'web-and-mobile', text: 'PawOS Web and Mobile (any browser)' },
      {
        type: 'table',
        headers: ['', 'Requirement'],
        rows: [
          ['PawOS Web', 'A current web browser on Windows, macOS or Linux. Nothing to install.'],
          ['PawOS on a phone', 'A current mobile browser on your phone. Nothing to install; you can add PawOS to your home screen.'],
          ['A phone paired with PawOS Desktop', 'The phone\u2019s browser, and PawOS Desktop running on a Windows computer signed in to the same account.'],
        ],
      },
      { type: 'heading', level: 2, id: 'cli', text: 'PawOS CLI' },
      {
        type: 'paragraph',
        text: 'The PawOS CLI needs Node.js 20 or newer and runs local project work from your current folder. It can use PawOS account services after sign-in; it does not require PawOS Desktop or the Web app to be installed. Sign-in may hand off to a browser.',
      },
    ],
    related: ['getting-started/installation'],
  },
  {
    section: 'getting-started',
    slug: 'quickstart',
    title: 'Quickstart',
    description: 'A five-minute walkthrough of your first session.',
    blocks: [
      {
        type: 'steps',
        items: [
          { title: 'Sign in', detail: 'Paw Go (free) requires only an account \u2014 no payment method.' },
          { title: 'Say or type something low-risk', detail: '"Open my downloads folder" is a good first request \u2014 it exercises the full plan \u2192 confirm \u2192 execute loop without touching anything sensitive.' },
          { title: 'Watch it narrate', detail: 'PawOS describes what it\u2019s about to do before doing it, and asks for confirmation before anything destructive.' },
          { title: 'Check Working History', detail: 'Every completed request leaves a real Work Record \u2014 open it from the sidebar to see exactly what ran.' },
        ],
      },
      {
        type: 'tip',
        text: 'Push-to-talk and the companion toggle are the two most-used shortcuts \u2014 both are shown once in Settings on first launch, and are reconfigurable afterward.',
      },
    ],
    related: ['getting-started/first-workspace', 'getting-started/first-coding-task', 'concepts/work-records'],
  },
  {
    section: 'getting-started',
    slug: 'first-workspace',
    title: 'First Workspace',
    description: 'Pointing PawOS at a real project folder.',
    blocks: [
      {
        type: 'lead',
        text: 'A workspace is a project folder PawOS has been given a scoped, confirmed boundary to work inside \u2014 see Core Concepts \u2192 Workspaces for the full model.',
      },
      {
        type: 'steps',
        items: [
          { title: 'Ask PawOS to open a project', detail: 'e.g. "open my project at C:\\dev\\my-app" or drag a folder onto the companion.' },
          { title: 'Confirm the workspace boundary', detail: 'PawOS only reads/writes inside the folder you named \u2014 it will ask before it needs to act outside it.' },
          { title: 'Ask a read-only question first', detail: 'e.g. "what does this project do?" \u2014 available on every tier, since it doesn\u2019t require the execution entitlement.' },
        ],
      },
      {
        type: 'table',
        headers: ['Workspace topic', 'Behavior'],
        rows: [
          ['Root folder', 'The selected folder is the normal boundary for coding and file actions.'],
          ['Existing repository', 'Git status, diff, log, branch, and commit actions use the repository when one is present.'],
          ['Unsupported layout', 'PawOS can still read files, but framework/build/test detection may be incomplete or skipped.'],
          ['Changing workspace', 'A later task can point at a different folder; previous Work Records keep their own evidence.'],
          ['Outside access', 'Writes and commands outside the declared boundary require explicit checks and are refused when unsafe.'],
          ['Symlinks and traversal', 'Path normalization and workspace-security checks are applied before writes or commands execute.'],
        ],
      },
    ],
    related: ['concepts/workspaces', 'getting-started/first-coding-task', 'coding/overview'],
  },
  {
    section: 'getting-started',
    slug: 'first-coding-task',
    title: 'First Coding Task',
    description: 'Running your first real, execution-gated coding request.',
    blocks: [
      {
        type: 'lead',
        text: 'Reading and planning are available on every tier. Actually editing files, running commands, or installing tools requires the advancedRuntimes entitlement \u2014 Paw Pro or higher.',
      },
      {
        type: 'steps',
        items: [
          { title: 'Open a workspace', detail: 'Select the project folder that contains the application.' },
          { title: 'Ask for the change', detail: 'Example: "Add dark mode to my application."' },
          { title: 'Project understanding', detail: 'PawOS inspects project structure, dependencies, routes/components, affected files, and existing style/theme conventions when supported.' },
          { title: 'Plan', detail: 'For a multi-file change, PawOS prepares a structured plan before mutation.' },
          { title: 'Visual plan review', detail: 'Review files affected, each file rationale, proposed hunk diffs, and estimated scope. Approve or reject the plan.' },
          { title: 'Authorization', detail: 'After plan approval, actual edits, commands, git writes, or installs still use the existing confirmation gate.' },
          { title: 'Code editing', detail: 'PawOS applies hunk-based patches against current on-disk files.' },
          { title: 'Diff and validation', detail: 'Inspect changed files, run tests/build/typecheck/lint where available, and review failures or skipped steps.' },
          { title: 'Live preview', detail: 'If the app can run locally, PawOS can start or use a dev server, check readiness, and capture a browser preview screenshot.' },
          { title: 'Browser verification', detail: 'For UI work, screenshots, console output, network errors, and visual verification results can become evidence.' },
          { title: 'Final Work Record', detail: 'The task closes with exactly what changed, what passed, what failed, what was not verified, and what remains.' },
        ],
      },
      {
        type: 'note',
        text: 'On Paw Go, the same request is answered as analysis/a suggested diff, not applied \u2014 PawOS tells you explicitly that execution requires an upgrade rather than silently doing less than asked.',
      },
    ],
    related: ['coding/overview', 'concepts/entitlements', 'billing/plans'],
  },
  {
    section: 'getting-started',
    slug: 'web-and-mobile',
    title: 'PawOS on the Web and your Phone',
    description: 'Continue from any browser or phone: chat with Paw and change code in your GitHub repository, without your computer.',
    keywords: ['web', 'mobile', 'phone', 'browser', 'pawos web', 'github', 'repository', 'change code', 'preview', 'continue in desktop'],
    blocks: [
      {
        type: 'lead',
        text: 'PawOS Web is PawOS in your browser — on a computer or your phone. Sign in with your PawOS account and you have the same plan, the same usage and the same chats as in PawOS Desktop. Connect GitHub and Paw can change code in your repository from wherever you are.',
      },
      { type: 'heading', level: 2, text: 'Get started', id: 'get-started' },
      {
        type: 'steps',
        items: [
          { title: 'Sign in', detail: 'Open pawos.revantaai.com/app in any browser and sign in with your PawOS account. On a phone you can add it to your home screen.' },
          { title: 'Chat with Paw', detail: 'Ask Paw to explain, plan or review — paste code, or (on paid plans) attach a photo or a file. Your chats from PawOS Desktop are already here, labelled "Desktop".' },
          { title: 'Connect GitHub', detail: 'Switch to Code with the Chat / Code switch at the top of the chat (Chat, the default, needs nothing set up). A short checklist walks you through it: connect GitHub (you can do it from your phone), then select the repository Paw works in.' },
          { title: 'Check the repository and branch', detail: 'Once selected, the repository and its branch stay shown above the message box — every change is committed and pushed to that branch. Use Switch to pick another repository.' },
          { title: 'Change code', detail: 'In Code mode, describe the change (on Paw Go: a small frontend change). A task panel shows each step as Paw reads the repository, writes the change, checks it and pushes it. Once work starts, the message box moves to the bottom of the chat.' },
          { title: 'See it live', detail: 'When your repository has preview deployments (Vercel, Netlify and others), the preview opens in a new tab. If a check or deployment fails, Paw tries to fix it automatically.' },
          { title: 'Continue on your computer', detail: 'Need your files, terminal or tests? Use Continue in PawOS Desktop — the chat is already there.' },
        ],
      },
      { type: 'heading', level: 2, text: 'What Web and mobile can do', id: 'capabilities' },
      {
        type: 'table',
        headers: ['', 'PawOS Web and mobile', 'PawOS Desktop'],
        rows: [
          ['Chat, explain, plan and review code', 'Yes', 'Yes'],
          ['Change code in a GitHub repository', 'Yes — pushed to the default branch (a pull request if it is protected)', 'Yes — in your local project'],
          ['Live preview and automatic fixes', 'Yes, from your repository’s preview deployments', 'Runs and tests locally'],
          ['Files, terminal, tests, installing packages', 'No', 'Yes (paid plans)'],
          ['Autonomous Work, browser automation, Jira, Linear, Slack', 'No', 'Yes, as your plan allows'],
          ['Desktop companion experience', 'No', 'Yes; Windows Desktop feature. Offline behavior is not verified.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Plans and usage', id: 'plans' },
      {
        type: 'list',
        items: [
          'Pro, Pro Max and Team: Web uses the same allowance as Desktop — a Team member’s own seat. There is no separate Web balance.',
          'Enterprise: Web messages count against your organization’s shared pool, like Desktop messages.',
          'Paw Go: 4 Web messages in total, prompts of up to 2 lines, no attachments; code changes are small edits to existing frontend files.',
        ],
      },
      {
        type: 'warning',
        text: 'For your safety, PawOS Web never edits environment files (.env), keys or certificates, CI workflows or lockfiles, and never asks for your GitHub password — you connect GitHub through GitHub’s own sign-in, and the token stays on PawOS’s servers.',
      },
    ],
    related: ['getting-started/web-cli-desktop', 'billing/web-and-desktop', 'getting-started/first-coding-task', 'connectors/github'],
  },
  {
    section: 'getting-started',
    slug: 'web-cli-desktop',
    title: 'Web, CLI or Desktop?',
    description: 'How PawOS Web, Desktop and CLI differ in where code runs and what each product can access.',
    keywords: ['web', 'cli', 'desktop', 'terminal', 'phone', 'mobile browser', 'compare', 'local files', 'npm', 'published version', 'candidate'],
    blocks: [
      { type: 'lead', text: 'PawOS is an AI Development Operating System with three product experiences. PawOS Web works in a browser with connected GitHub repositories; PawOS Desktop runs locally on Windows; PawOS CLI is independently installed and runs local project work from your terminal. Phone access is PawOS Web in a mobile browser or a paired view of Desktop.' },
      { type: 'warning', text: 'The CLI does not require the Desktop app or Web interface to be installed for local terminal use. It does require a PawOS account; signing in may require a browser handoff. Published CLI 1.2.0 and local unpublished candidate 1.2.1 have different commands.' },
      { type: 'heading', level: 2, text: 'Capability comparison', id: 'compare' },
      {
        type: 'table',
        headers: ['Capability', 'PawOS Web', 'Published CLI 1.2.0', 'Desktop source'],
        rows: [
          ['Local project access', 'No; works with connected GitHub repositories.', 'Yes; operates in the folder where `pawos` starts.', 'Yes; operates in a selected local workspace.'],
          ['Git and non-Git folders', 'GitHub repository required for Code tasks.', 'Local project work supports non-Git folders; Git workflows require a repository. GitHub features depend on remote/account setup.', 'Local workspace can be non-Git; Git operations require Git/repository context.'],
          ['Development execution', 'Does not run project commands on your computer; reads repository checks/previews.', 'Runs an approved set of local development programs and project checks.', 'Runs registered local development actions subject to permission and supported tooling.'],
          ['Environment diagnostics', 'None for the local machine.', 'No `/env` command in 1.2.0.', 'Source includes environment discovery/checks; runtime not independently verified here.'],
          ['Environment repair', 'No.', 'No.', 'Source includes PATH and environment-variable management with confirmation/elevation where required; not independently runtime verified here.'],
          ['Software management', 'No local installs.', 'No Desktop-style installer manager.', 'Source includes install, verify, repair and uninstall plugins; package/OS support varies and was not runtime verified here.'],
          ['Validation and recovery', 'Shows repository-provided checks/previews; does not run local tests.', 'Runs local commands; `/undo` covers PawOS file changes, not command side effects or commits.', 'Source includes validation runners, retry/recovery and Work Records; coverage is partial and not runtime verified here.'],
          ['Integrations', 'GitHub-backed coding workflow and supported Web connectors.', '1.2.0 exposes no candidate `/tools`, `/github`, `/linear` or `/work` command; see candidate disclosure below.', 'Source registers connector/MCP plugins; individual provider operations depend on connector, plan and authorization.'],
          ['Browser and process verification', 'Can show repository previews/checks; cannot inspect a local app/process.', 'Can manage a local development server and request a local browser open; it cannot inspect the rendered page.', 'Source includes managed browser and process tools; adapter support varies and visual checks are not guaranteed in the default pipeline.'],
        ],
      },
      { type: 'heading', level: 2, text: 'Local CLI candidate 1.2.1 — unpublished', id: 'cli-candidate' },
      {
        type: 'paragraph',
        text: 'The repository contains a local 1.2.1 candidate that adds `/env`, `/tools`, `/github`, `/linear`, and `/work`. These commands are not in the published npm 1.2.0 package. Candidate tests do not prove that service-backed endpoints are deployed or working for production accounts.',
      },
      {
        type: 'table',
        headers: ['Candidate command', 'Scope'],
        rows: [
          ['/env [tool]', 'Read-only paths and Java/Android environment diagnostics. Tools: node, npm, git, python (python3/py aliases), java, javac, adb, sdkmanager. It does not repair PATH or install software.'],
          ['/tools', 'Shows service-reported GitHub and Linear tools.'],
          ['/github … and /linear …', 'A limited set of repository/issue/PR/file reads and confirmed comments. No general MCP executor. Live production availability is unverified.'],
          ['/work <ticket>', 'Candidate ticket-work flow for supported GitHub/Linear references. Entitlement, billing, account and writeback paths require live verification; it is not a promise of automatic PR creation.'],
        ],
      },
      { type: 'status', status: 'not-verified', text: 'Candidate CLI 1.2.1 passed local tests/build/package checks, but is unpublished. Live service/API behavior has not been independently verified. The currently published npm version is 1.2.0.' },
      { type: 'heading', level: 2, text: 'Desktop source and release status', id: 'desktop-status' },
      { type: 'paragraph', text: 'Desktop source includes local project execution, environment/software management, validation, recovery, Work Records, managed browser/process features, and integrations. Not every feature is verified in this documentation audit, supported on every machine, or enabled for every account.' },
      { type: 'status', status: 'not-verified', text: 'The existing Desktop 1.0.4 MSIX is unsigned, has no matching WACK report or verified source provenance, and has not passed disposable-environment installation/runtime checks. It is not certified or ready for Partner Center and is not proven equivalent to current source.' },
      { type: 'heading', level: 2, text: 'Choose where the work belongs', id: 'which' },
      {
        type: 'table',
        headers: ['Use', 'When'],
        rows: [
          ['Web', 'You want a browser-based workspace for chat or supported GitHub repository work.'],
          ['CLI', 'You want a terminal coding agent working directly in the local folder, including a non-Git project. The current npm package is 1.2.0.'],
          ['Desktop', 'The task needs Desktop-specific Windows environment/software management, managed browser/process tools, integrations, or a UI Work Record. Treat source-backed features as unverified unless stated otherwise.'],
        ],
      },
      { type: 'note', text: 'Plans and entitlements are enforced by PawOS services. The account may be shared, but capabilities, project access, execution location, and approval flows differ by product.' },
    ],
    related: ['getting-started/four-ways-to-work', 'getting-started/installation', 'coding/overview', 'security/permissions'],
  },
];
