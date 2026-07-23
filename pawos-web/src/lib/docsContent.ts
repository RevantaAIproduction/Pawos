export type DocCategory =
  | "Getting Started"
  | "Companion"
  | "Collaboration"
  | "Configuration"
  | "Billing & Enterprise"
  | "Operations"
  | "Reference";

export type DocPage = {
  slug: string;
  title: string;
  category: DocCategory;
  summary: string;
  body: { heading?: string; paragraphs: string[]; list?: string[] }[];
  related?: string[];
};

export const DOCS: DocPage[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    category: "Getting Started",
    summary: "What PawOS is, what it isn't, and the fastest path to your first real task.",
    body: [
      {
        paragraphs: [
          "PawOS is a native desktop application — an AI companion that runs on your machine, sees what you're working on, and can take real, confirmed action on files, terminals, browsers, and deployments.",
          "It is not a browser-based chatbot. There is no PawOS web app for everyday use — the desktop app is the product, and pawos.app exists to explain it, document it, and let you download it.",
        ],
      },
      {
        heading: "The fastest path to value",
        paragraphs: ["Once installed, the shortest useful loop is:"],
        list: [
          "Sign in (or use Guest mode to try it without an account)",
          "Ask Paw to do something real — open a project, organize a folder, run a build",
          "Watch it plan, confirm anything risky, and execute",
          "Check the Coding Canvas for live progress on multi-step tasks",
        ],
      },
    ],
    related: ["installation", "quick-start", "system-requirements"],
  },
  {
    slug: "installation",
    title: "Installation",
    category: "Getting Started",
    summary: "How to install PawOS once a build is available for your platform.",
    body: [
      {
        paragraphs: [
          "PawOS installers are not yet publicly published — see the Download page for current status per platform. Once available, installation follows the standard pattern for each OS: run the installer on Windows, mount and drag to Applications on macOS, or run the AppImage/install the package on Linux.",
          "No separate runtime (like Node.js or Python) needs to be installed first — PawOS ships as a self-contained Electron application.",
        ],
      },
    ],
    related: ["system-requirements", "getting-started"],
  },
  {
    slug: "system-requirements",
    title: "System Requirements",
    category: "Getting Started",
    summary: "Minimum and recommended specs per platform.",
    body: [
      {
        paragraphs: ["PawOS is an Electron application with a real-time 3D companion renderer, so requirements are modest but not trivial."],
        list: [
          "Windows: Windows 10 (64-bit) or later, 4 GB RAM minimum (8 GB recommended)",
          "macOS: macOS 12 Monterey or later, Apple Silicon or Intel",
          "Linux: a modern glibc-based distribution (Ubuntu 22.04+ or equivalent), 4 GB RAM minimum",
          "A GPU capable of basic WebGL is recommended for smooth companion animation",
        ],
      },
    ],
    related: ["installation", "download"],
  },
  {
    slug: "quick-start",
    title: "Quick Start",
    category: "Getting Started",
    summary: "A five-minute walkthrough of your first session.",
    body: [
      {
        paragraphs: [
          "After installing and signing in, PawOS starts with your companion visible on your desktop. Press and hold push-to-talk, or type in the conversation panel, to give it your first request.",
        ],
        list: [
          "Try something low-risk first: \"open my downloads folder\" or \"what's the weather doing to my calendar today\" style small talk to get a feel for responsiveness.",
          "Then try something with real action: \"create a new folder called test-project on my desktop.\"",
          "Notice the confirmation prompt before anything destructive runs — that's by design, not a bug.",
          "Open Companion Studio from the sidebar to customize your companion's appearance, voice, and personality.",
        ],
      },
    ],
    related: ["getting-started", "companions", "voice"],
  },
  {
    slug: "companions",
    title: "Companions",
    category: "Companion",
    summary: "Creating, customizing, uploading, and managing your companion.",
    body: [
      {
        paragraphs: [
          "Every PawOS install includes Companion Studio — where you customize appearance, voice, behavior, personality, and memory for your companion, or upload your own 3D model (GLB, GLTF, VRM, FBX, or OBJ, which is automatically rigged).",
          "Companions can be exported and imported as a portable .paw package, so a customized companion can be backed up or shared.",
        ],
      },
    ],
    related: ["voice", "runtime-configuration"],
  },
  {
    slug: "voice",
    title: "Voice",
    category: "Companion",
    summary: "Push-to-talk, speech synthesis, and voice configuration.",
    body: [
      {
        paragraphs: [
          "Voice interaction uses push-to-talk by default: hold the configured key or button to capture speech, which streams to speech-to-text as you talk. Responses are synthesized and spoken sentence-by-sentence as they're generated, not after the full response is ready, to keep conversation feeling natural.",
          "Voice, speed, and emotional tone are configurable per companion in Companion Studio.",
        ],
      },
    ],
    related: ["companions"],
  },
  {
    slug: "projects",
    title: "Projects",
    category: "Collaboration",
    summary: "How PawOS understands and works within your projects.",
    body: [
      {
        paragraphs: [
          "PawOS builds project understanding from what it observes — file structure, recent activity, and prior work captured in the Memory Graph — surfaced in the Coding Canvas whenever you're working within a recognized project folder.",
          "For Team and Enterprise organizations, projects can be shared within an Organization Workspace, with members, documents, and task assignment scoped to the project.",
        ],
      },
    ],
    related: ["tasks", "plans"],
  },
  {
    slug: "tasks",
    title: "Tasks",
    category: "Collaboration",
    summary: "Task lifecycle, assignment, and live progress tracking.",
    body: [
      {
        paragraphs: [
          "Every non-trivial request becomes a tracked task with a live TODO list visible in the Coding Canvas — status only ever reports \"Completed\" once the work has genuinely finished.",
          "In Team and Enterprise workspaces, tasks can be assigned to specific members, linked to a repository and task type (bug, feature, chore), and tracked through an Activity Dashboard.",
        ],
      },
    ],
    related: ["projects", "plans"],
  },
  {
    slug: "plans",
    title: "Plans",
    category: "Billing & Enterprise",
    summary: "Go, Pro, Pro Max, Team, and Enterprise — what each includes.",
    body: [
      {
        paragraphs: ["See the full Pricing page for current rates and feature comparison. In short:"],
        list: [
          "Go — free, no AI models, local runtime features only",
          "Pro — $20/mo, unlocks reasoning models and advanced runtimes",
          "Pro Max — $100/mo, higher usage limits and priority model access",
          "Team — $20/seat/mo (2–150 seats), adds shared workspaces and admin controls",
          "Enterprise — $100/seat/mo (20+ seats), adds advanced security, custom limits, and dedicated support",
        ],
      },
    ],
    related: ["billing-and-usage", "enterprise-deployment"],
  },
  {
    slug: "providers",
    title: "Providers",
    category: "Configuration",
    summary: "How PawOS routes requests to AI models without exposing a raw provider choice.",
    body: [
      {
        paragraphs: [
          "You interact with named Paw models (Flash, Swift, Core, Creative, Vision, Voice) rather than choosing a raw provider — the underlying reasoning/speech provider is an internal routing detail, matched to your tier and the task at hand.",
          "For infrastructure and integrations (hosting, source control, ticket trackers), PawOS connects to your own already-authenticated CLI or API sessions for each real provider — see Runtime Configuration and Deployments.",
        ],
      },
    ],
    related: ["runtime-configuration", "deployments"],
  },
  {
    slug: "runtime-configuration",
    title: "Runtime Configuration",
    category: "Configuration",
    summary: "Connecting real infrastructure and communication providers.",
    body: [
      {
        paragraphs: [
          "Infrastructure connectors (hosting, source control, project management, CI/CD) are configured via environment variables read at startup, documented in the app's own .env.example — each connector reports honestly whether it's configured and authenticated rather than silently failing.",
          "Most cloud/hosting connectors require you to already be authenticated with that provider's own official CLI (e.g. `aws configure`, `gcloud auth login`, `doctl auth init`) — PawOS never manages your cloud credentials on your behalf.",
        ],
      },
    ],
    related: ["deployments", "providers", "security-architecture"],
  },
  {
    slug: "billing-and-usage",
    title: "Billing",
    category: "Billing & Enterprise",
    summary: "How subscriptions, credits, and Autonomous Engineering Task billing work.",
    body: [
      {
        paragraphs: [
          "Subscriptions are billed monthly per plan (see Plans). Autonomous Engineering Tasks are billed separately and only on success — see the Pricing page's Autonomous Engineering section and the dedicated Autonomous Ticket Resolution doc for the full billing model.",
          "Billing history, current usage, and payment methods are all managed from Settings → Billing inside the app.",
        ],
      },
    ],
    related: ["plans", "autonomous-ticket-resolution"],
  },
  {
    slug: "enterprise-deployment",
    title: "Enterprise",
    category: "Billing & Enterprise",
    summary: "Deploying PawOS across an organization.",
    body: [
      {
        paragraphs: [
          "PawOS scales from a single Paw to an Organization Workspace without a separate enterprise product — see the Enterprise page for the full capability list (shared workspaces, governance, credential vault, audit log, remote assistance).",
          "Organization membership is restricted to a verified, shared email domain by design, so workspace membership stays meaningful as an organization grows.",
        ],
      },
    ],
    related: ["plans", "security-architecture", "audit-and-compliance"],
  },
  {
    slug: "ci-cd",
    title: "CI/CD",
    category: "Operations",
    summary: "How PawOS fits into continuous integration and delivery.",
    body: [
      {
        paragraphs: [
          "PawOS's own CI/CD connectors (GitHub Actions, GitLab CI) provide real, read-only build/run status so Paw can answer \"did the build pass\" honestly. Triggering and configuring your CI/CD pipelines themselves remains in your existing tooling — PawOS observes and can act on results (like triggering a redeploy after a green build) rather than replacing your pipeline.",
        ],
      },
    ],
    related: ["deployments"],
  },
  {
    slug: "deployments",
    title: "Deployments",
    category: "Operations",
    summary: "Deploying real projects through the Infrastructure Runtime.",
    body: [
      {
        paragraphs: [
          "See the Infrastructure Runtime documentation for the full architecture. In practice: tell Paw to deploy, and it picks (or you specify) a connected provider, runs a real deploy through that provider's own CLI/API, and verifies health afterward.",
        ],
      },
    ],
    related: ["runtime-configuration"],
    // cross-reference to the runtime detail page is via /docs/runtimes/infrastructure-runtime
  },
  {
    slug: "settings",
    title: "Settings",
    category: "Configuration",
    summary: "Where every configuration option lives inside the app.",
    body: [
      {
        paragraphs: [
          "Settings is organized into flat categories: Account, Devices, Preferences, AI, Privacy, Security, Browser Tools, Billing, and Developers — each scoped to one coherent area rather than a deep nested tree.",
        ],
      },
    ],
    related: ["privacy-and-data", "security-architecture"],
  },
  {
    slug: "security-architecture",
    title: "Security",
    category: "Operations",
    summary: "How PawOS handles confirmation gates, credentials, and audit evidence.",
    body: [
      {
        paragraphs: [
          "See the dedicated Security page for the full overview of encryption, authentication, runtime isolation, and credential storage. This doc focuses on where to configure it: Settings → Security for individual devices, and Organization → Governance for org-wide policy, credential vault, and audit log.",
        ],
      },
    ],
    related: ["settings", "audit-and-compliance"],
  },
  {
    slug: "privacy-and-data",
    title: "Privacy",
    category: "Operations",
    summary: "What data PawOS collects, stores locally, and shares.",
    body: [
      {
        paragraphs: [
          "Most PawOS data — companion memory, conversation history, workspace memory — stays local on your device unless you explicitly share it to an Organization Workspace. See the Privacy Policy for the full legal detail and Settings → Privacy for in-app controls.",
        ],
      },
    ],
    related: ["security-architecture"],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    category: "Operations",
    summary: "Common issues and how to resolve them.",
    body: [
      {
        paragraphs: ["Common starting points:"],
        list: [
          "Companion not responding to voice — check microphone permissions in your OS settings and Settings → Voice inside PawOS.",
          "A deploy connector reports \"not configured\" — confirm the relevant CLI is installed and authenticated on your machine (see Runtime Configuration).",
          "A task seems stuck — check the Coding Canvas for its live status; PawOS never silently marks unfinished work as complete.",
        ],
      },
      {
        heading: "Still stuck?",
        paragraphs: ["Search the Knowledge Base, or contact Support if you can't find an answer."],
      },
    ],
    related: ["faq"],
  },
  {
    slug: "api-reference",
    title: "API Reference",
    category: "Reference",
    summary: "The current state of PawOS's programmatic interfaces.",
    body: [
      {
        paragraphs: [
          "PawOS does not currently expose a public, stable REST or GraphQL API for third-party integration. Internally, the desktop app communicates between its main and renderer processes over a typed IPC contract, and Team/Enterprise features are backed by Supabase with row-level security.",
          "A public API is not on the current roadmap as a committed feature — if that changes, this page will document real endpoints, not a speculative draft.",
        ],
      },
    ],
    related: ["developer-documentation"],
  },
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    category: "Reference",
    summary: "Default shortcuts inside the PawOS desktop app.",
    body: [
      {
        paragraphs: ["Exact default bindings are configurable in Settings → Preferences and may vary by platform. Push-to-talk and the companion toggle are the two most-used shortcuts and are shown in Settings the first time you launch the app."],
      },
    ],
    related: ["quick-start"],
  },
  {
    slug: "faq",
    title: "FAQ",
    category: "Reference",
    summary: "Frequently asked questions, indexed by topic.",
    body: [
      {
        paragraphs: ["See the dedicated FAQ page for the full, searchable list covering installation, billing, providers, enterprise, companions, privacy, security, deployments, updates, downloads, licensing, and support."],
      },
    ],
    related: ["troubleshooting"],
  },
  {
    slug: "glossary",
    title: "Glossary",
    category: "Reference",
    summary: "Key terms used throughout PawOS documentation.",
    body: [
      {
        paragraphs: ["Terms worth defining up front:"],
        list: [
          "Paw — your companion; also used informally for PawOS itself",
          "Runtime — a focused subsystem (e.g. Universal Execution, Browser, Infrastructure) responsible for one class of real-world action",
          "Autonomous Engineering Task — one completed, billed cycle of investigate → plan → implement → test → deliver for a real ticket",
          "Organization Workspace — a shared Team/Enterprise environment scoped to a verified email domain",
          "Connector — a real integration with an external provider (a hosting platform, source control system, ticket tracker) behind a common interface",
        ],
      },
    ],
  },
  {
    slug: "versioning",
    title: "Versioning",
    category: "Reference",
    summary: "How PawOS releases are versioned.",
    body: [
      {
        paragraphs: ["PawOS follows semantic versioning (major.minor.patch) once public releases begin. See the Changelog for what's shipped in development so far."],
      },
    ],
    related: ["release-notes"],
  },
  {
    slug: "migration-guides",
    title: "Migration Guides",
    category: "Reference",
    summary: "Guidance for upgrading between PawOS versions.",
    body: [
      {
        paragraphs: ["No breaking migrations exist yet — PawOS has not published a versioned release. Once one ships, any migration steps required between versions will be documented here in full, not summarized."],
      },
    ],
  },
  {
    slug: "release-notes",
    title: "Release Notes",
    category: "Reference",
    summary: "What's shipped, and when.",
    body: [
      {
        paragraphs: ["See the Changelog for the full, chronological history of what's been built."],
      },
    ],
    related: ["versioning"],
  },
  {
    slug: "architecture-overview",
    title: "Architecture Overview",
    category: "Reference",
    summary: "How PawOS is put together, at a glance.",
    body: [
      {
        paragraphs: [
          "PawOS is an Electron desktop application. The main process owns system-level integration (file system, processes, IPC, native windows); the renderer process owns UI and the 3D companion. A router directs conversational requests to the right internal runtime (Universal Execution, Browser, Infrastructure, Communication, Companion, Governance), each independently real rather than one monolithic prompt.",
          "Team and Enterprise features are backed by Supabase, with row-level security scoping every table to the requesting organization.",
        ],
        list: [],
      },
    ],
    related: ["developer-documentation"],
  },
  {
    slug: "developer-documentation",
    title: "Developer Documentation",
    category: "Reference",
    summary: "For engineers building on or contributing to PawOS.",
    body: [
      {
        paragraphs: [
          "There is no separate public SDK yet — see Architecture Overview for the high-level system design. For anything not covered there, reach the team directly through Support.",
        ],
      },
    ],
    related: ["architecture-overview", "api-reference"],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}
