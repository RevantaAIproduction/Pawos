import type { DocPage, DocScreenshot } from '../types';

/**
 * The screenshots on this page. Each is a real capture of PawOS, served from /public/docs.
 * To replace one, drop the new file in pawos-web/public/docs and change `src`, `width` and `height`
 * here. Set `src` to null and the page shows a labelled slot in its place instead of an image.
 */
const WEB_SCREENSHOT: DocScreenshot = { slot: 'WEB_SCREENSHOT', src: '/docs/pawos-web.png', width: 1493, height: 697, alt: 'PawOS Web in a desktop browser, in Code mode, showing the Connect GitHub, Select a repository and Start coding steps.', caption: 'PawOS Web, Code mode: connect GitHub, select a repository, then describe the change.' };
const MOBILE_SCREENSHOT: DocScreenshot = { slot: 'MOBILE_SCREENSHOT', src: '/docs/pawos-mobile.jpg', width: 739, height: 1600, alt: 'PawOS Web in a phone browser, in Code mode, with GitHub connected and the Choose repository step next.', caption: 'PawOS on a phone: the same PawOS Web, in the phone’s browser.', portrait: true };
const DESKTOP_SCREENSHOT: DocScreenshot = { slot: 'DESKTOP_SCREENSHOT', src: '/docs/pawos-desktop.png', width: 1218, height: 807, alt: 'The PawOS Desktop app with its companion, asking what to build, fix, automate or research.', caption: 'PawOS Desktop, with its companion, ready for a task.' };
const CLI_SCREENSHOT: DocScreenshot = { slot: 'CLI_SCREENSHOT', src: '/docs/pawos-cli.png', width: 725, height: 361, alt: 'The PawOS CLI in a terminal: the PawOS mascot and recent activity in a box, the folder, branch and GitHub repository, and the prompt.', caption: 'PawOS CLI: the start screen, with the folder, branch and repository it found.' };

export const fourWaysPages: DocPage[] = [
  {
    section: 'getting-started',
    slug: 'four-ways-to-work',
    title: 'PawOS across Web, Mobile, Desktop and CLI',
    description: 'One PawOS, four ways to work: from your browser, your phone, your desktop or your terminal.',
    keywords: ['pawos web', 'pawos mobile', 'pawos desktop', 'pawos cli', 'four ways', 'ai engineering companion', 'ai developer workspace', 'engineering workflow', 'github', 'code changes', 'terminal', 'npm install', '@revantaai/pawos-cli', 'start a task', 'which one', 'phone', 'browser'],
    blocks: [
      {
        type: 'lead',
        text: 'One PawOS. Four ways to work. Work from your browser, phone, desktop, or terminal while keeping the same PawOS engineering workflow.',
      },
      {
        type: 'paragraph',
        text: 'PawOS is an AI engineering companion. You give it real engineering work, and it takes that work from investigation to planning, implementation, Git and pull requests, and verification. Web, Mobile, Desktop and the CLI are four ways into the same PawOS account: the same plan, the same usage and the same conversations. What each one can do depends on where it runs, and this page says exactly what that is.',
      },
      {
        type: 'cards',
        items: [
          { title: 'PawOS Web', subtitle: 'In your browser', detail: 'Browser-based workspace, nothing to install', points: ['Chat with Paw', 'Change code in a GitHub repository', 'See your repository’s checks and previews'] },
          { title: 'PawOS Mobile', subtitle: 'On your phone', detail: 'In the browser, or paired with Desktop', points: ['Stay in touch with your work', 'Chat, start and review GitHub-based work', 'Continue anywhere else'] },
          { title: 'PawOS Desktop', subtitle: 'On your Windows computer', detail: 'Windows only, from the Microsoft Store', points: ['Works on your local project', 'Runs commands, tests and builds', 'Connected tools and Autonomous Work'] },
          { title: 'PawOS CLI', subtitle: 'In your terminal', detail: 'Terminal-based, from any folder', points: ['Chat from your shell', 'The same Code mode as Web', 'Asks before it changes code'] },
        ],
      },

      // ------------------------------------------------------------------ Web
      { type: 'heading', level: 2, text: 'PawOS Web', id: 'web' },
      { type: 'paragraph', text: 'An AI engineering workspace in your browser. Use it when you want to work without installing anything, on code that is on GitHub.' },
      { type: 'heading', level: 3, text: 'How to start', id: 'web-start' },
      {
        type: 'steps',
        items: [
          { title: 'Open PawOS Web', detail: 'Go to pawos.revantaai.com/app in any browser.' },
          { title: 'Sign in', detail: 'Use your PawOS account. Your plan, usage and chats are the same as everywhere else in PawOS.' },
          { title: 'Choose Chat or Code', detail: 'The switch at the top of the workspace. Chat is for asking, explaining, planning and reviewing, and needs nothing set up. Code is for work that changes your repository.' },
          { title: 'Connect GitHub', detail: 'The first time you choose Code, a short checklist asks you to connect GitHub through GitHub’s own sign-in.' },
          { title: 'Select a repository', detail: 'Choose the repository Paw works in. The repository and its branch stay shown above the message box.' },
          { title: 'Give PawOS the task', detail: 'Describe the change, for example: “Fix the authentication bug in the login flow.”' },
          { title: 'PawOS works through it', detail: 'On paid plans Paw reads the relevant files from GitHub, follows what they import, plans the change, writes it and pushes it. On Paw Go, Code makes small edits to existing frontend files. A task panel shows each step as it happens.' },
          { title: 'Review the result', detail: 'You get the summary, the files changed and the commit. The change is pushed to the default branch, or to a new branch with a pull request if that branch is protected. Web then shows what your repository’s own checks and preview deployments report.' },
        ],
      },
      { type: 'screenshot', shot: WEB_SCREENSHOT },
      {
        type: 'note',
        text: 'PawOS Web works on what is on GitHub. It has no terminal and no access to files on your computer, and it does not build or run your code: it reads the result of the checks your repository already has. If your repository has no checks or previews, the change is pushed but not verified, and PawOS says so.',
      },
      { type: 'paragraph', text: 'Best for: a browser-based engineering workspace, when your work is already on GitHub.' },

      // --------------------------------------------------------------- Mobile
      { type: 'heading', level: 2, text: 'PawOS Mobile', id: 'mobile' },
      { type: 'paragraph', text: 'Stay connected to your engineering work from your phone. There are two ways, and neither is a separate app to download. PawOS Web works in your phone’s browser — the same workspace, laid out for a small screen, which you can add to your home screen. And you can pair your phone with PawOS Desktop to follow a desktop session from it.' },
      { type: 'heading', level: 3, text: 'How to start', id: 'mobile-start' },
      {
        type: 'steps',
        items: [
          { title: 'Open PawOS on your phone', detail: 'Go to pawos.revantaai.com/app in your phone’s browser.' },
          { title: 'Sign in', detail: 'Use the same PawOS account. Your chats, including the ones from PawOS Desktop, are already there.' },
          { title: 'Use your project', detail: 'In Code, connect GitHub and choose the repository — you can do both from your phone. If you already selected one on another device, it is selected here too.' },
          { title: 'Start or continue work', detail: 'Chat with Paw, or describe a change in Code. It is the same Chat and the same Code as PawOS Web on a computer, with the same limits.' },
          { title: 'Review progress and results', detail: 'The task panel shows each step, and the result shows the commit, the files changed and what your repository’s checks report.' },
          { title: 'Go deeper elsewhere', detail: 'When the work needs your local files, a terminal or tests run on your machine, continue in PawOS Desktop. The conversation is already there.' },
        ],
      },
      { type: 'screenshot', shot: MOBILE_SCREENSHOT },
      {
        type: 'note',
        text: 'In the browser, a phone gets exactly what PawOS Web has, and nothing more: no terminal, no local files, and it does not reach the files on your computer.',
      },
      { type: 'heading', level: 3, text: 'Pair your phone with PawOS Desktop', id: 'mobile-pairing' },
      {
        type: 'steps',
        items: [
          { title: 'Show the pairing code', detail: 'In PawOS Desktop, open Trusted Devices and show the QR code.' },
          { title: 'Scan it with your phone', detail: 'Sign in with the same PawOS account when asked. The phone confirms it is paired, and Desktop shows it as connected.' },
          { title: 'Follow the desktop session', detail: 'The paired phone shows what PawOS Desktop is doing, receives its notifications, and lets you approve or deny an action that is waiting for your confirmation.' },
        ],
      },
      {
        type: 'note',
        text: 'A paired phone follows and approves what a desktop session is doing. It does not run engineering work itself, and it does not replace PawOS Desktop.',
      },
      { type: 'paragraph', text: 'Best for: staying connected to your work while you are away from your main workstation.' },

      // -------------------------------------------------------------- Desktop
      { type: 'heading', level: 2, text: 'PawOS Desktop', id: 'desktop' },
      { type: 'paragraph', text: 'A deeper engineering workspace for developers who need local project context and desktop capabilities. PawOS Desktop works on the project on your computer, and asks before it changes anything.' },
      { type: 'heading', level: 3, text: 'How to start', id: 'desktop-start' },
      {
        type: 'steps',
        items: [
          { title: 'Install and open PawOS Desktop', detail: 'PawOS Desktop is for Windows only, and is installed from the Microsoft Store. It is not available for macOS or Linux.' },
          { title: 'Sign in', detail: 'Use your PawOS account.' },
          { title: 'Choose your project', detail: 'Pick the workspace folder PawOS works in. That folder is the boundary for files and commands.' },
          { title: 'Give PawOS an engineering task', detail: 'For example: “Find the failing TypeScript errors, fix them, and verify the build.”' },
          { title: 'PawOS investigates the project', detail: 'It reads your local project, including work you have not pushed, and proposes a plan for multi-file work that you can approve, reject or revise.' },
          { title: 'It works with your files, terminal and Git', detail: 'It edits files in the workspace and runs commands from an approved list of developer tools, such as git, npm, node and python, each with your permission.' },
          { title: 'Review the implementation and verification', detail: 'It runs your tests and builds on your machine and reports the results. Every task leaves a Work Record: the commands that ran, their output, the files changed and the test results.' },
        ],
      },
      { type: 'screenshot', shot: DESKTOP_SCREENSHOT },
      {
        type: 'cta',
        text: 'Use Desktop when the task needs your local machine, terminal, local files, local runtimes, or deeper desktop workflows.',
        label: 'Get PawOS Desktop for Windows',
        href: 'https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN',
      },
      {
        type: 'note',
        text: 'PawOS Desktop is for Windows only. These are Desktop capabilities: working on local files, running commands and tests, installing software, using connected tools inside a task, and Autonomous Work. None of them is available on Web, Mobile or the CLI. On Desktop, working on files, the terminal and tests is part of paid plans.',
      },
      { type: 'paragraph', text: 'Best for: work that needs your local project, your terminal, or tests and builds run on your machine.' },

      // ------------------------------------------------------------------ CLI
      { type: 'heading', level: 2, text: 'PawOS CLI', id: 'cli' },
      { type: 'paragraph', text: 'Bring PawOS directly into your terminal. The CLI is the npm package @revantaai/pawos-cli; the command it installs is pawos. It needs Node.js 20 or newer.' },
      { type: 'code', lang: 'bash', code: 'npm install -g @revantaai/pawos-cli' },
      { type: 'code', lang: 'bash', code: 'pawos' },
      { type: 'heading', level: 3, text: 'How to start', id: 'cli-start' },
      {
        type: 'steps',
        items: [
          { title: 'Install the CLI', detail: 'Run npm install -g @revantaai/pawos-cli.' },
          { title: 'Run pawos', detail: 'From any folder. Git is not required to start.' },
          { title: 'Sign in when asked', detail: 'The CLI prints a PawOS address. Open it in your browser, sign in, choose Authorize, and paste the address PawOS shows you back into the terminal. It never asks for your password in the terminal.' },
          { title: 'PawOS finds where you are', detail: 'It shows the folder, the Git branch when there is one, and the GitHub repository when the folder has a GitHub remote. Inside a project whose repository is the one selected in your PawOS account, Code mode is on.' },
          { title: 'Questions and conversation are Chat', detail: 'PawOS reads what you are asking for before it does anything. A greeting, a question or a request to explain is answered as chat.' },
          { title: 'Real engineering requests are tasks', detail: 'An instruction to change the project, such as “Fix the authentication bug”, is recognised as a task.' },
          { title: 'A task asks permission first', detail: 'PawOS shows the repository it will change and asks you to allow, deny or always allow. Nothing is sent until you allow it.' },
          { title: 'PawOS does the work and reports it', detail: 'You see the steps as they start and finish, then the summary, the files changed, the checks, and the commit or pull request.' },
          { title: 'Use /chat to just talk', detail: 'After /chat, everything you type is conversation until you switch back.' },
          { title: 'Use /code for Code mode', detail: '/code switches to Code mode. /code followed by a request makes that one request a task, whatever its wording.' },
        ],
      },
      { type: 'screenshot', shot: CLI_SCREENSHOT },
      { type: 'heading', level: 3, text: 'Chat or task: PawOS decides first', id: 'cli-intent' },
      { type: 'paragraph', text: 'The CLI does not treat every message as a coding task. It looks at what you are asking PawOS to do. Asking about a change is conversation; telling PawOS to make it is a task.' },
      {
        type: 'table',
        headers: ['You type', 'What it is', 'What happens'],
        rows: [
          ['Hello', 'Conversation', 'PawOS replies. No permission question.'],
          ['Explain how the authentication flow works.', 'Explanation', 'PawOS answers in chat. No permission question, nothing is changed.'],
          ['Explain how I could fix the login bug', 'Explanation', 'Chat. It asks how, not for the change.'],
          ['What files would you change to fix the login bug?', 'Question', 'Chat. Nothing is changed.'],
          ['Fix the login bug', 'Engineering task', 'PawOS asks permission, then starts the change only after you allow it.'],
          ['Go ahead and fix the login bug', 'Engineering task', 'The same: permission first.'],
        ],
      },
      {
        type: 'note',
        text: 'For a task, the CLI sends your request to the same service as PawOS Web’s Code mode. The change is made on GitHub, not in the files in your folder — pull it once you have reviewed it. The CLI does not run your project’s commands, does not see changes you have not pushed, and follows the same plan and usage rules as Web.',
      },
      { type: 'paragraph', text: 'Best for: having PawOS directly in your terminal and developer workflow.' },

      // ------------------------------------------------------- Same workflow
      { type: 'heading', level: 2, text: 'Same PawOS workflow', id: 'workflow' },
      { type: 'paragraph', text: 'The interface changes with where you are working. The engineering goal does not.' },
      {
        type: 'list',
        ordered: true,
        items: ['Give PawOS a goal', 'Understand the project', 'Investigate', 'Plan', 'Implement', 'Work with Git and pull requests', 'Verify', 'Review the result'],
      },
      { type: 'paragraph', text: 'Web, Desktop, Mobile and CLI expose different capabilities depending on the environment, while sharing the same PawOS account and product direction. Not every one does every step the same way:' },
      {
        type: 'table',
        headers: ['Step', 'Web and Mobile', 'CLI', 'Desktop'],
        rows: [
          ['Understand and investigate', 'Reads files from your GitHub repository (a limited number per change)', 'Same as Web', 'Reads your local project'],
          ['Plan', 'Plans from the files it read (paid plans)', 'Same as Web', 'Proposes a plan you approve, reject or revise'],
          ['Implement', 'Commits the change on GitHub', 'Same as Web, after you allow it', 'Edits the files in your workspace folder'],
          ['Git and pull requests', 'Pushes to the default branch; a pull request if it is protected', 'Same as Web', 'Local Git, through its approved terminal tools'],
          ['Verify', 'Reads your repository’s own checks and previews', 'Same as Web', 'Runs tests and builds on your machine'],
          ['Review', 'Task panel, commit and checks', 'Summary, files, checks, commit or pull request', 'Work Record'],
        ],
      },

      // --------------------------------------------------------- Which one?
      { type: 'heading', level: 2, text: 'When should I use which?', id: 'which' },
      {
        type: 'table',
        headers: ['', 'Best when'],
        rows: [
          ['Web', 'You want a browser-based engineering workspace.'],
          ['Mobile', 'You want to stay connected to your work while away from your main workstation.'],
          ['Desktop', 'PawOS needs deeper local project and desktop interaction, on a Windows computer.'],
          ['CLI', 'You want PawOS directly in your terminal and developer workflow.'],
        ],
      },

      // ------------------------------------------------------- First task
      { type: 'heading', level: 2, text: 'Start your first engineering task', id: 'first-task' },
      {
        type: 'table',
        headers: ['Where', 'The path'],
        rows: [
          ['Web', 'Open PawOS Web → choose Code → connect GitHub → select a repository → give PawOS a task → review the work'],
          ['Mobile', 'Open PawOS in your phone’s browser → sign in → choose Code and your repository → start, continue or review work. Or pair the phone with PawOS Desktop to follow a desktop session.'],
          ['Desktop', 'Install PawOS Desktop from the Microsoft Store (Windows only) → open it → choose your project folder → give PawOS a task → review the implementation and verification'],
          ['CLI', 'Install the CLI → run pawos → sign in → use the repository it found → give PawOS a task → allow it when asked → review the result'],
        ],
      },
      {
        type: 'tip',
        text: 'You don’t have to start over when you switch. Your chats are shared: a conversation started on Web or in the CLI is already in PawOS Desktop.',
      },
    ],
    related: ['getting-started/web-cli-desktop', 'getting-started/web-and-mobile', 'getting-started/installation', 'mobile/overview', 'getting-started/first-coding-task'],
  },
];
