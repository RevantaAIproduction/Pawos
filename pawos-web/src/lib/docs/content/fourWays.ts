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
    title: 'PawOS across Web, Desktop and CLI',
    description: 'Three product experiences with different project access and execution boundaries; mobile access uses Web or a paired Desktop session.',
    keywords: ['pawos web', 'pawos desktop', 'pawos cli', 'mobile browser', 'npm install', 'local project', 'capability comparison'],
    blocks: [
      { type: 'lead', text: 'PawOS is an AI Development Operating System with three product experiences. Choose based on where your project lives and where you want commands and changes to run.' },
      {
        type: 'cards',
        items: [
          { title: 'PawOS Web', subtitle: 'In a browser', detail: 'Browser workspace using PawOS services and connected repositories.', points: ['Chat and account experience', 'GitHub-based coding tasks', 'Shows checks and previews provided by the repository', 'No local file access or local command execution'] },
          { title: 'PawOS Desktop', subtitle: 'Windows local companion', detail: 'Works with a selected local workspace and Desktop runtimes.', points: ['Local coding and approved development commands', 'Environment/software management in source', 'Validation, recovery and Work Records in source', 'Browser, process and integrations vary by implementation and account'] },
          { title: 'PawOS CLI', subtitle: 'Independently installed terminal agent', detail: 'Starts in the local folder you choose; Git is not required for local project work.', points: ['Local file, command, Git and undo workflows', 'Node.js 20 or newer', 'Does not require Desktop or a Web app installation', 'Browser authorization may be used for PawOS account sign-in'] },
        ],
      },
      { type: 'screenshot', shot: WEB_SCREENSHOT },
      { type: 'screenshot', shot: DESKTOP_SCREENSHOT },
      { type: 'screenshot', shot: CLI_SCREENSHOT },
      { type: 'heading', level: 2, text: 'Capability comparison', id: 'capabilities' },
      {
        type: 'table',
        headers: ['Capability', 'Web', 'Published CLI 1.2.0', 'Desktop source'],
        rows: [
          ['Local project files', 'No', 'Yes; in the current folder, including non-Git projects', 'Yes; selected workspace'],
          ['Git and non-Git support', 'GitHub repository for coding', 'Non-Git local work; Git operations need a repository', 'Non-Git local workspace; Git actions need Git/repository'],
          ['Development execution', 'No local commands', 'Approved local development commands, tests/builds', 'Registered local command/runtime actions with permissions'],
          ['Environment diagnostics', 'No local diagnostics', '1.2.0 has no `/env`', 'Source-backed discovery/checks; not independently runtime verified here'],
          ['Environment repair and software management', 'No', 'No', 'Source-backed PATH/environment and install/repair/uninstall operations; not independently runtime verified here'],
          ['Validation and recovery', 'Repository checks/previews only', 'Local checks; `/undo` is file-only and does not reverse commands/commits', 'Validation/recovery/Work Records in source; some evidence is partial'],
          ['Integrations', 'Supported Web and GitHub flows', 'Connection status; candidate commands are not in 1.2.0', 'Connector/MCP plugins in source; per-provider coverage varies'],
          ['Browser and process verification', 'Repository previews, not local apps', 'Can start/stop a dev server and open localhost, cannot inspect a page', 'Managed browser/process code; support varies, visual checks not guaranteed automatically'],
        ],
      },
      { type: 'heading', level: 2, text: 'Published CLI and local candidate', id: 'cli-release' },
      { type: 'paragraph', text: 'The currently published npm package is `@revantaai/pawos-cli` 1.2.0. A local 1.2.1 candidate adds `/env`, `/tools`, `/github`, `/linear`, and `/work`; it is unpublished. Candidate service-backed behavior is not verified against live production APIs. See the CLI README for the version-specific commands and limitations.' },
      { type: 'status', status: 'not-verified', text: 'Do not infer that candidate commands are available to npm users. `/env` is read-only diagnostics. It does not repair PATH.' },
      { type: 'heading', level: 2, text: 'Desktop release status', id: 'desktop-release' },
      { type: 'status', status: 'not-verified', text: 'The existing Desktop 1.0.4 MSIX is unsigned, lacks a matching WACK report and verified source provenance, and has not passed disposable-environment install/runtime checks. It is not certified, Partner Center ready, or proven equivalent to current source.' },
      { type: 'heading', level: 2, text: 'Using PawOS on a phone', id: 'phone' },
      { type: 'paragraph', text: 'PawOS on a phone is PawOS Web in a mobile browser, or a paired view of a running Desktop session. A phone browser does not gain access to a computer’s local files or terminal.' },
      { type: 'screenshot', shot: MOBILE_SCREENSHOT },
      { type: 'heading', level: 2, text: 'Install the CLI', id: 'install-cli' },
      { type: 'code', lang: 'bash', code: 'npm install -g @revantaai/pawos-cli\npawos' },
      { type: 'paragraph', text: 'Local CLI usage does not require PawOS Desktop or PawOS Web to be installed. A PawOS account is required, and sign-in may hand off through a browser.' },
      { type: 'note', text: 'Use Web for browser-based repository work, CLI for a local terminal workflow, and Desktop when a task specifically needs a Desktop runtime. Capability status in this comparison is product-specific; source presence is not a live-release or runtime verification.' },
    ],
    related: ['getting-started/web-cli-desktop', 'getting-started/web-and-mobile', 'getting-started/installation', 'mobile/overview', 'getting-started/first-coding-task'],
  },
];
