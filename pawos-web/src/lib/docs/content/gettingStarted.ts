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
        text: 'PawOS is a native desktop app \u2014 an AI companion that runs on your machine and can take real, confirmed action on your files, terminal, browser, and connected services.',
      },
      {
        type: 'paragraph',
        text: 'It is not a browser-based chatbot and there is no PawOS web app for everyday use. The desktop app is the product. This site exists to explain, document, and distribute it.',
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
          ['Getting Started', 'Install, first run, your first workspace and coding task'],
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
          { title: 'Start with the desktop app', detail: 'PawOS Desktop is where the full product lives — beside your files, browser, terminal, and companion. Away from your computer, continue on PawOS Web from any browser or phone: the same account, chats and usage, and code changes through your connected GitHub repository.' },
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
          ['Paw Compute', 'The usage meter for normal reasoning and runtime work ($1 of value = 100 PC).'],
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
        text: 'The PawOS CLI needs Node.js 20 or newer. It works on PawOS\u2019s servers through your PawOS account, so it does not need PawOS Desktop.',
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
          ['Meetings, Companion, working offline', 'No', 'Yes'],
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
    description: 'What you can do in PawOS Web, in the PawOS CLI and in PawOS Desktop — and when a task needs Desktop.',
    keywords: ['web', 'cli', 'desktop', 'terminal', 'phone', 'mobile browser', 'compare', 'difference', 'which one', 'local files', 'requires desktop', 'needs desktop', 'command line', 'pawos cli'],
    blocks: [
      {
        type: 'lead',
        text: 'Start on the Web. Go deeper with Desktop. PawOS is one account with three ways in. Web and the CLI work on code that is on GitHub; Desktop works on your own computer. Knowing which is which before you start saves you from beginning a task in the wrong place.',
      },
      {
        type: 'warning',
        text: 'Web is best for browser-based GitHub work. Desktop is required when your task needs local files, terminal access, local runtimes, or deeper desktop workflows. Web and the CLI never run your project’s code and never see files that are only on your computer.',
      },
      {
        type: 'cards',
        items: [
          {
            title: 'PawOS Web',
            subtitle: 'Browser-based workspace',
            detail: 'Desktop browser + mobile browser',
            points: ['Chat with Paw', 'Change code in a GitHub repository', 'See your repository’s checks and previews', 'Nothing to install'],
          },
          {
            title: 'PawOS CLI',
            subtitle: 'Terminal workspace',
            detail: 'Any folder',
            points: ['Chat with Paw from your shell', 'The same Code mode as Web', 'Shows the folder, branch and GitHub repository you are in', 'Account, usage and connection status'],
          },
          {
            title: 'PawOS Desktop',
            subtitle: 'Full local development workspace',
            detail: 'Terminal + files + local runtime',
            points: ['Works on the files on your computer', 'Runs commands, tests and builds locally', 'Connected tools and Autonomous Work', 'Everything your plan includes'],
          },
        ],
      },

      { type: 'heading', level: 2, text: 'Compare', id: 'compare' },
      {
        type: 'table',
        headers: ['Capability', 'Web', 'CLI', 'Desktop'],
        rows: [
          ['Chat with PawOS', '✓', '✓', '✓'],
          ['Code changes in a GitHub repository', '✓', '✓ (sent to the same service as Web)', '✓ (in your local project)'],
          ['Reads the code before changing it', '✓ From GitHub, a limited number of files', '✓ Same as Web', '✓ From your local project'],
          ['Start without a Git repository', '✓ Chat', '✓ Chat, from any folder', '✓ Any workspace folder'],
          ['Use from a phone browser', '✓', '—', '—'],
          ['Files on your computer', '—', '—', '✓'],
          ['Local terminal and commands', '—', '—', '✓ An approved list of developer tools, with your permission'],
          ['Run tests, builds and your app locally', '—', '—', '✓'],
          ['Local changes you haven’t pushed', '—', '—', '✓'],
          ['Where a change lands', 'Committed and pushed on GitHub (a pull request if the branch is protected)', 'Same as Web — pull it afterwards', 'In your local files'],
          ['How a change is checked', 'Your repository’s own checks and preview deployments, read from GitHub', 'Same as Web', 'Tests and builds run on your machine'],
          ['Install software, repair PATH', '—', '—', '✓'],
          ['Connected tools in a task (Jira, Linear, Slack, MCP)', '— Connection status only', '— Connection status only', '✓ As your plan allows'],
          ['Autonomous Work', '— Not currently available', '— Not currently available', '✓ As your plan allows'],
          ['Meetings, Companion, working offline', '—', '—', '✓'],
          ['Plan, usage and account status', '✓', '✓', '✓'],
        ],
      },
      {
        type: 'note',
        text: 'One account, one plan: Web, the CLI and Desktop share your plan, your usage allowance and your chats. Your plan’s limits apply the same way in all three — none of them unlocks something the others don’t.',
      },

      { type: 'heading', level: 2, text: 'Which one should I use?', id: 'which-one' },
      { type: 'heading', level: 3, text: 'Start with Web', id: 'start-with-web' },
      {
        type: 'list',
        items: [
          'You want to work from anywhere, including your phone.',
          'You want to chat with Paw, or change code that is already on GitHub.',
          'You don’t need your local terminal, files or a running app.',
        ],
      },
      { type: 'heading', level: 3, text: 'Use the CLI', id: 'use-the-cli' },
      {
        type: 'list',
        items: [
          'You prefer the terminal and want PawOS in your development shell.',
          'You want PawOS to pick up the folder, branch and GitHub repository you are standing in.',
          'Your work is on GitHub — the CLI makes the same GitHub-based changes as Web.',
        ],
      },
      { type: 'heading', level: 3, text: 'Use Desktop', id: 'use-desktop' },
      {
        type: 'list',
        items: [
          'The task needs files on your computer, or changes you haven’t pushed.',
          'The task needs the terminal: running commands, tests, builds or your app.',
          'The task needs software installed or your environment repaired.',
          'You want connected tools used inside a task, or Autonomous Work.',
        ],
      },
      {
        type: 'cta',
        text: 'Use Desktop when the task needs your local machine, terminal, local files, local runtimes, or deeper desktop workflows.',
        label: 'Get PawOS Desktop for Windows',
        href: 'https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN',
      },

      { type: 'heading', level: 2, text: 'PawOS Web', id: 'web' },
      {
        type: 'paragraph',
        text: 'PawOS Web is PawOS in a browser. It is the same site on a computer, a tablet and a phone — there is no separate mobile app to install.',
      },
      { type: 'heading', level: 3, text: 'What it does', id: 'web-does' },
      {
        type: 'list',
        items: [
          'Chat: ask Paw to explain, plan or review. Paid plans can attach a photo or a file.',
          'Connect GitHub and choose the repository Paw works in.',
          'Code mode: describe a change. On paid plans Paw reads the relevant files from GitHub, follows what they import, plans the change, writes it and pushes it. On Paw Go, Code mode makes small edits to existing frontend files.',
          'A change is committed and pushed to the repository’s default branch. If that branch is protected, it goes to a new branch with a pull request instead.',
          'After the push, Web shows what your repository’s own checks and preview deployments report, opens the preview when there is one, and tries to fix a reported failure automatically.',
          'Your plan, your usage and your connections, the same as everywhere else in PawOS.',
        ],
      },
      { type: 'heading', level: 3, text: 'What it does not do', id: 'web-limits' },
      {
        type: 'list',
        items: [
          'No local terminal, and no commands run on your computer.',
          'No access to files or folders on your computer.',
          'It does not build, test or run your code. It reads the result of the checks your repository already has. If your repository has no checks or preview deployments, the change is pushed but not verified, and PawOS says so.',
          'It works from what is on GitHub. Changes you haven’t pushed are not visible to it.',
          'It reads a limited number of files per change rather than searching the whole repository.',
          'It never edits environment files, keys, CI workflows or lockfiles.',
        ],
      },
      { type: 'heading', level: 3, text: 'On your phone', id: 'phone' },
      {
        type: 'paragraph',
        text: 'PawOS Web works from your phone’s browser, and you can add it to your home screen. It is good for chatting with Paw, checking on work, reviewing a change, and starting or continuing GitHub-based work while you are away from your computer.',
      },
      {
        type: 'list',
        items: [
          'It is the same PawOS Web, with the same limits: no terminal and no local files.',
          'It does not turn your phone into PawOS Desktop, and it does not reach the files on your computer.',
        ],
      },

      { type: 'heading', level: 2, text: 'PawOS CLI', id: 'cli' },
      {
        type: 'paragraph',
        text: 'The PawOS CLI is PawOS in your terminal. Install it with npm, then run pawos in any folder: it signs you in through your browser, greets you, shows where you are, and asks what you would like to work on.',
      },
      { type: 'code', lang: 'bash', code: 'npm install -g @revantaai/pawos-cli' },
      { type: 'heading', level: 3, text: 'What it does', id: 'cli-does' },
      {
        type: 'list',
        items: [
          'Starts from any folder. Git is not required.',
          'Chat with Paw — the same conversation you see on Web.',
          'Shows the Git branch when the folder is a Git repository, and the GitHub repository when it has a GitHub remote.',
          'Code mode, inside a folder whose GitHub repository is the one selected in your PawOS account: a request to change the project is recognised as a task, PawOS asks your permission, and then your request goes to the same service as Web’s Code mode. You see its progress and its result — summary, files changed, checks, commit and pull request. A greeting, a question or a request to explain is answered as chat instead.',
          'Your account, plan and usage, and the status of your connections.',
          'Signs in with your PawOS account in the browser. It never asks for your password in the terminal.',
        ],
      },
      { type: 'heading', level: 3, text: 'What it does not do', id: 'cli-limits' },
      {
        type: 'list',
        items: [
          'It is not a separate coding engine. Code mode runs on PawOS’s servers, exactly as it does for Web.',
          'It does not edit the files in your folder. Changes are made on GitHub — pull them once you have reviewed them.',
          'It does not see local changes you haven’t pushed.',
          'It does not run your project’s commands, tests or builds.',
          'It does not call connected tools or MCP servers itself, and it cannot start Autonomous Work.',
          'It follows the same plan, usage and organization rules as Web. It cannot be used to get around them.',
        ],
      },
      {
        type: 'tip',
        text: 'If a task in the CLI needs your local files, terminal or a running app, that is a Desktop task. PawOS tells you when a request needs the desktop app, and nothing is done from the CLI in that case.',
      },

      { type: 'heading', level: 2, text: 'PawOS Desktop', id: 'desktop' },
      {
        type: 'paragraph',
        text: 'PawOS Desktop is the app on your computer and the deepest way to work with PawOS. You choose a workspace folder, and PawOS works inside it — asking before it changes anything.',
      },
      { type: 'heading', level: 3, text: 'What it does', id: 'desktop-does' },
      {
        type: 'list',
        items: [
          'Works on your local project: reads it, plans changes, and edits the files in your workspace folder, including work you haven’t pushed.',
          'Runs commands in the terminal from an approved list of developer tools (such as git, npm, node, python and docker), with your permission.',
          'Runs your tests and builds, starts your app, and shows a preview.',
          'Installs software and repairs PATH and environment problems.',
          'Uses your connected tools inside a task, as your plan allows.',
          'Autonomous Work on tickets, as your plan allows.',
          'Meetings, the Companion, and working offline.',
          'Keeps a Work Record of what ran: commands, output, files changed and test results.',
        ],
      },
      { type: 'heading', level: 3, text: 'Good to know', id: 'desktop-notes' },
      {
        type: 'list',
        items: [
          'PawOS Desktop is for Windows only, installed from the Microsoft Store. It is not available for macOS or Linux.',
          'Working on files, the terminal and tests in Desktop is part of paid plans.',
          'The terminal is an approved list of developer tools, not an unrestricted shell.',
          'Editing files, running commands, installing software and connecting accounts each ask for your approval.',
        ],
      },

      { type: 'heading', level: 2, text: 'Moving a task to Desktop', id: 'handoff' },
      {
        type: 'paragraph',
        text: 'You don’t have to start over. Your chats are shared: a conversation started on Web is already in PawOS Desktop. When a reply on Web says the next step needs your computer, choose Continue in PawOS Desktop and carry on from there.',
      },
      {
        type: 'faq',
        items: [
          { q: 'Can Web or the CLI run my tests?', a: 'No. They read the result of the checks your repository already runs on GitHub. To run tests yourself, on your machine, use PawOS Desktop.' },
          { q: 'I have changes I haven’t pushed. Can Web or the CLI see them?', a: 'No. They work from what is on GitHub. Push your changes first, or use PawOS Desktop, which works on your local files.' },
          { q: 'Is there a PawOS mobile app?', a: 'There is no separate app to download. PawOS Web works in your phone\u2019s browser and can be added to your home screen, with the same capabilities and limits as Web on a computer. You can also pair your phone with PawOS Desktop to follow a desktop session from it \u2014 see Mobile Overview.' },
          { q: 'Does the CLI change the files in my folder?', a: 'No. It makes the change on GitHub and shows you the commit or pull request. Pull the change when you are ready.' },
          { q: 'Do I need a different plan for each?', a: 'No. One PawOS account and one plan cover Web, the CLI and Desktop, with one shared usage allowance.' },
        ],
      },
    ],
    related: ['getting-started/four-ways-to-work', 'getting-started/web-and-mobile', 'getting-started/installation', 'coding/overview', 'billing/web-and-desktop'],
  },
];
