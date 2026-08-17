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
        text: 'PawOS is a native Electron desktop application \u2014 an AI companion that runs on your machine and can take real, confirmed action on your files, terminal, browser, and connected services.',
      },
      {
        type: 'paragraph',
        text: 'It is not a browser-based chatbot and there is no PawOS web app for everyday use. The desktop app is the product. This site exists to explain, document, and distribute it.',
      },
      { type: 'heading', level: 2, id: 'how-it-works', text: 'How it works, at a glance' },
      {
        type: 'paragraph',
        text: 'A conversational runtime (main process: ConversationRuntime + ExecutionSupervisor) turns what you ask for into typed action requests, dispatches them through a plugin-based execution engine (DesktopExecutionEngine), and records what actually happened as structured evidence \u2014 not a summary the model wrote after the fact.',
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
    ],
    related: ['getting-started/installation', 'getting-started/quickstart', 'concepts/workspaces'],
  },
  {
    section: 'getting-started',
    slug: 'installation',
    title: 'Installation',
    description: 'How to install PawOS once a build is available for your platform.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS ships as a self-contained Electron application \u2014 no separate runtime like Node.js or Python needs to be installed first.',
      },
      {
        type: 'status',
        status: 'not-verified',
        text: 'Public installers are not yet published for general download. Check the Download page for current per-platform availability before following the steps below.',
      },
      {
        type: 'steps',
        items: [
          { title: 'Windows', detail: 'Run the installer (.exe). PawOS installs to your user profile; no administrator rights are required for the base install.' },
          { title: 'macOS', detail: 'Mount the disk image and drag PawOS into Applications.' },
          { title: 'Linux', detail: 'Run the AppImage directly, or install the distributed package for your distribution.' },
        ],
      },
      { type: 'heading', level: 2, id: 'first-launch', text: 'First launch' },
      {
        type: 'paragraph',
        text: 'On first launch you\u2019ll be asked to sign in (Paw Go, the free tier, requires only an account) and grant OS-level permissions PawOS needs for its companion overlay and, if you use voice, microphone access.',
      },
    ],
    related: ['getting-started/system-requirements', 'getting-started/quickstart'],
  },
  {
    section: 'getting-started',
    slug: 'system-requirements',
    title: 'System Requirements',
    description: 'Minimum specs per platform.',
    blocks: [
      {
        type: 'table',
        headers: ['Platform', 'Requirement'],
        rows: [
          ['Windows', 'Windows 10 (64-bit) or later, 4\u202fGB RAM minimum (8\u202fGB recommended)'],
          ['macOS', 'macOS 12 Monterey or later, Apple Silicon or Intel'],
          ['Linux', 'A modern glibc-based distribution (Ubuntu 22.04+ or equivalent), 4\u202fGB RAM minimum'],
        ],
      },
      {
        type: 'note',
        text: 'A GPU capable of basic WebGL is recommended for smooth companion rendering \u2014 PawOS still runs without one, with reduced animation quality.',
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
          { title: 'Open a workspace', detail: 'See First Workspace.' },
          { title: 'Ask for a small, real change', detail: 'e.g. "add a README section explaining the build script."' },
          { title: 'Review the confirmation', detail: 'File edits and commands are confirmed before they run \u2014 read what PawOS is about to do.' },
          { title: 'Check the Work Record', detail: 'Confirms exactly which file changed, what command ran, and whether validation passed \u2014 see Core Concepts \u2192 Work Records.' },
        ],
      },
      {
        type: 'note',
        text: 'On Paw Go, the same request is answered as analysis/a suggested diff, not applied \u2014 PawOS tells you explicitly that execution requires an upgrade rather than silently doing less than asked.',
      },
    ],
    related: ['coding/overview', 'concepts/entitlements', 'billing/plans'],
  },
];
