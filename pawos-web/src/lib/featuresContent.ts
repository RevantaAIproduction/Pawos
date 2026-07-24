export type FeatureContent = {
  slug: string;
  title: string;
  tagline: string;
  category: "Core" | "Engineering" | "Collaboration" | "Platform";
  summary: string;
  capabilities: string[];
  workflow: { step: string; detail: string }[];
  useCases: string[];
  limitations: string[];
};

export const FEATURES: FeatureContent[] = [
  {
    slug: "desktop-ai",
    title: "Desktop AI",
    tagline: "A companion that lives on your machine, not in a browser tab.",
    category: "Core",
    summary:
      "PawOS runs as a native desktop app. Your companion sees your active window, understands what you're working on, and can act on your machine directly — opening apps, running commands, editing files — instead of being confined to a chat window.",
    capabilities: [
      "Runs locally as an Electron desktop application",
      "Foreground-window awareness so Paw knows what you're looking at",
      "A persistent, animated companion presence alongside your work",
      "Streaming responses with sentence-chunked speech for natural conversation",
    ],
    workflow: [
      { step: "You ask", detail: "Type or speak a request — anything from \"open my project\" to \"fix this bug.\"" },
      { step: "Paw plans", detail: "Paw checks what's actually possible on your machine before acting, and narrates its plan in plain language." },
      { step: "Paw confirms", detail: "Destructive or irreversible actions pause for your explicit confirmation first." },
      { step: "Paw executes", detail: "The action runs locally, with results and errors reported back honestly." },
    ],
    useCases: [
      "Hands-free control while your hands are busy elsewhere",
      "A single point of contact for everyday desktop tasks",
      "Reducing context-switching between apps, terminals, and browsers",
    ],
    limitations: [
      "Currently single-device — Paw acts on the machine it's running on, not remotely",
      "Requires the desktop app to be running; there is no standalone cloud version",
    ],
  },
  {
    slug: "voice-control",
    title: "Voice Control",
    tagline: "Push-to-talk conversation with real speech synthesis.",
    category: "Core",
    summary:
      "Talk to Paw the way you'd talk to a colleague. Push-to-talk captures your voice, speech-to-text transcribes it, and Paw replies with synthesized speech that starts as soon as the first sentence is ready — not after the whole response is generated.",
    capabilities: [
      "Push-to-talk with low-latency capture",
      "Streaming text-to-speech, chunked sentence by sentence",
      "Viseme timing so the companion's mouth shape matches speech",
      "Configurable voice, speed, and emotional tone per companion",
    ],
    workflow: [
      { step: "Hold to talk", detail: "Press and hold the push-to-talk control, or use the configured hotkey." },
      { step: "Speak naturally", detail: "Your speech streams to the speech-to-text provider as you talk." },
      { step: "Paw responds", detail: "The reply streams back and is spoken sentence-by-sentence, not held until it's fully written." },
    ],
    useCases: [
      "Dictating requests while your hands are on the keyboard for something else",
      "A more natural interaction than typing for quick questions",
    ],
    limitations: [
      "Voice quality depends on the configured provider — PawOS doesn't train its own voice models",
      "Background noise can affect transcription accuracy, as with any speech-to-text system",
    ],
  },
  {
    slug: "browser-automation",
    title: "Browser Automation",
    tagline: "A real, controllable browser Paw can navigate, read, and act in.",
    category: "Engineering",
    summary:
      "The Browser Runtime gives Paw a real, adapter-based connection to your browser — navigate pages, read content, fill forms, click elements, extract structured data, and compare results across sites, always with permission gates before anything that changes state.",
    capabilities: [
      "Navigate, search, read, and extract structured data from web pages",
      "Fill forms, click elements, scroll, and wait for page state",
      "Upload/download file handling with real tracking",
      "Multi-tab session management and generic script evaluation",
      "A dedicated comparison workflow for evaluating multiple sources side by side",
    ],
    workflow: [
      { step: "Describe the goal", detail: "Tell Paw what you want to find, compare, or accomplish on the web." },
      { step: "Paw navigates", detail: "It opens, searches, and reads pages, narrating what it's finding as it goes." },
      { step: "Permission gate", detail: "Actions that submit forms or change external state ask for confirmation first." },
      { step: "Structured result", detail: "Paw returns extracted data or a completed action, not just a raw page dump." },
    ],
    useCases: [
      "Research that spans multiple sites without you tab-juggling",
      "Filling repetitive forms with data you already have",
      "Comparing prices, specs, or options across several pages",
    ],
    limitations: [
      "Browser automation is desktop-scoped — it drives a real local browser session, not a headless cloud fleet",
      "Sites with aggressive bot detection may still block automated interaction",
    ],
  },
  {
    slug: "desktop-automation",
    title: "Desktop Automation",
    tagline: "Files, apps, and processes — handled directly on your machine.",
    category: "Engineering",
    summary:
      "The Universal Execution Runtime is PawOS's general-purpose desktop actuator: opening and managing applications, running allowlisted shell commands, manipulating files safely, and watching processes for health — all through a single, auditable execution engine.",
    capabilities: [
      "Open apps, folders, and files, including opening a project in your editor",
      "Run allowlisted commands (npm, git, node, python, and more) with shell selection",
      "Safe file lifecycle operations — create, move, copy, merge, recycle bin support",
      "Process lifecycle management with health checks",
      "A recovery policy that retries and repairs failed steps instead of just failing",
    ],
    workflow: [
      { step: "Describe the task", detail: "\"Install this dependency,\" \"organize my downloads folder,\" \"restart the dev server.\"" },
      { step: "Requirement check", detail: "Paw verifies the tools and permissions it needs exist before attempting anything." },
      { step: "Execute with narration", detail: "Each step is described in plain language as it happens, not after the fact." },
      { step: "Recover or report", detail: "If something fails, Paw attempts a real recovery step before honestly reporting what went wrong." },
    ],
    useCases: [
      "Day-to-day desktop chores you'd otherwise script yourself",
      "Setting up or tearing down local development environments",
      "File organization and cleanup across a project",
    ],
    limitations: [
      "Command execution is allowlisted by design — Paw won't run arbitrary, unreviewed shell commands",
      "Destructive actions always require your confirmation before running",
    ],
  },
  {
    slug: "planning",
    title: "Planning",
    tagline: "Paw plans before it acts, and shows you the plan.",
    category: "Core",
    summary:
      "Every non-trivial request goes through a visible planning stage. Paw breaks work into a live TODO list, tracks progress against it in the Coding Canvas, and adapts the plan honestly when reality doesn't match expectations — rather than pretending a task is done when it isn't.",
    capabilities: [
      "Live TODO progress tracking visible while work happens",
      "Deterministic multi-step workflows for well-defined jobs like research and comparison",
      "Task status that only reports \"Completed\" when the work genuinely finished",
      "Evidence preservation — screenshots and outputs are kept even when a step partially fails",
    ],
    workflow: [
      { step: "Break down the request", detail: "Paw turns a request into concrete, ordered steps before starting." },
      { step: "Track live", detail: "Each step's status updates in real time in the Coding Canvas." },
      { step: "Adapt honestly", detail: "If a step reveals new information, the plan updates — it isn't silently forced to match the original guess." },
    ],
    useCases: [
      "Multi-step engineering tasks that need visible progress, not a black box",
      "Long-running research where you want to see what's been checked so far",
    ],
    limitations: [
      "Planning quality depends on the underlying reasoning model configured for your tier",
    ],
  },
  {
    slug: "memory",
    title: "Memory",
    tagline: "A companion that remembers your projects, not just this conversation.",
    category: "Core",
    summary:
      "PawOS builds an evidence-based Memory Graph from what it observes and does — project structure, past decisions, communication history, and companion-specific preferences — so context persists across sessions instead of resetting every time you open the app.",
    capabilities: [
      "An evidence-based Memory Graph linking entities, actions, and outcomes",
      "Workspace-level memory of project structure and prior work",
      "Companion-scoped memory for personality-consistent recall",
      "Communication memory — contacts, companies, and relationship history from meetings and calls",
    ],
    workflow: [
      { step: "Observe", detail: "Paw records what it does and learns as real, evidenced entries — never invented ones." },
      { step: "Recall", detail: "Relevant memory surfaces automatically when it's useful to the current task." },
      { step: "Explain", detail: "You can ask Paw why it believes something, and it points to the real evidence behind it." },
    ],
    useCases: [
      "Picking up a project days later without re-explaining context",
      "Relationship history surfacing automatically before a follow-up meeting",
    ],
    limitations: [
      "Memory is local to your device unless explicitly shared to an organization workspace",
    ],
  },
  {
    slug: "files",
    title: "Files",
    tagline: "Safe, verified file operations — never a silent overwrite.",
    category: "Engineering",
    summary:
      "File operations run through a dedicated lifecycle layer with copy verification, conflict policies, and recycle-bin-backed deletion — so Paw can create, move, merge, and organize files without the risk of silent data loss.",
    capabilities: [
      "Copy-with-verify for every file operation, including hash checks on smaller files",
      "Configurable conflict handling — skip, overwrite, or rename on collision",
      "Recycle bin integration instead of permanent deletion",
      "Folder merging and duplicate detection",
    ],
    workflow: [
      { step: "Request the operation", detail: "\"Merge these two folders,\" \"find duplicate files,\" \"back this up.\"" },
      { step: "Conflict policy applied", detail: "Paw follows your chosen policy for anything that would collide." },
      { step: "Verify", detail: "Copies are checked against the source before being considered successful." },
    ],
    useCases: [
      "Reorganizing project folders without manual drag-and-drop",
      "Safe bulk file operations with an undo path via the recycle bin",
    ],
    limitations: [
      "Permanent deletion still requires explicit confirmation — Paw defaults to recoverable actions",
    ],
  },
  {
    slug: "terminal",
    title: "Terminal",
    tagline: "Real shell access, allowlisted and narrated.",
    category: "Engineering",
    summary:
      "Paw can run real commands in a real terminal — npm, git, python, node, and more — with shell selection, live output streaming into the Coding Canvas, and build status parsed from the actual output rather than guessed.",
    capabilities: [
      "Allowlisted command execution with shell selection (bash, PowerShell, cmd)",
      "Live, independently-expandable terminal output in the Coding Canvas",
      "Real build status parsed from actual compiler/bundler output",
      "Process lifecycle management for long-running dev servers",
    ],
    workflow: [
      { step: "Request a command", detail: "\"Run the tests,\" \"start the dev server,\" \"install this package.\"" },
      { step: "Execute and stream", detail: "Output streams live so you can watch progress, not just a final result." },
      { step: "Parse the outcome", detail: "Success or failure is read from the real output, not assumed." },
    ],
    useCases: [
      "Running builds, tests, and dev servers without leaving the conversation",
      "Diagnosing a failing command from its real error output",
    ],
    limitations: [
      "Only allowlisted command families run without extra confirmation, by design",
    ],
  },
  {
    slug: "git",
    title: "Git",
    tagline: "Real git operations, including AI-assisted PR review.",
    category: "Engineering",
    summary:
      "PawOS's Git Write Runtime covers the everyday git workflow — add, commit, branch, checkout — plus, for Team and Enterprise workspaces, real pull request reading and AI-assisted review against your organization's connected repositories.",
    capabilities: [
      "Add, commit, create branches, and checkout through a real git runtime",
      "Read-only git plugins for log, diff, and status inspection",
      "Pull request review and commenting via connected source-control providers",
      "Branch ownership and task-linked repository context in Team/Enterprise workspaces",
    ],
    workflow: [
      { step: "Make changes", detail: "Paw edits files as part of a coding task." },
      { step: "Stage and commit", detail: "Changes are committed with a clear message reflecting what changed and why." },
      { step: "Review (Team/Enterprise)", detail: "Pull requests can be read and reviewed against real repository history, not fabricated diffs." },
    ],
    useCases: [
      "Day-to-day git hygiene without leaving the conversation",
      "AI-assisted first-pass PR review before a human reviewer looks",
    ],
    limitations: [
      "Force-pushes and history rewrites are never performed without explicit, scoped confirmation",
    ],
  },
  {
    slug: "deployments",
    title: "Deployments",
    tagline: "Real deploys across a growing set of real providers.",
    category: "Engineering",
    summary:
      "The Infrastructure Runtime deploys through a provider-agnostic connector interface — Vercel, Netlify, Railway, Google Cloud Run, AWS Elastic Beanstalk and EC2, Docker/VPS, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud, Azure (VM and App Service), Kubernetes, Render, Fly.io, GitHub Pages, and Hostinger — each shelling to that provider's own already-authenticated CLI or API, never inventing a deployment mechanism a provider doesn't actually have.",
    capabilities: [
      "One consistent deploy/status/rollback/promote interface across every provider",
      "Cloud VM provisioning (EC2, Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud) that launches a real instance and deploys to it over SSH + Docker",
      "Automatic health-check-and-rollback after a deploy",
      "Deployment comparison and infrastructure discovery across connected providers",
    ],
    workflow: [
      { step: "Request a deploy", detail: "\"Deploy this to production,\" or let Paw suggest the right target for the project." },
      { step: "Safety gate", detail: "Production-impacting deploys go through an approval gate before running." },
      { step: "Deploy and verify", detail: "Paw deploys, then checks real health signals rather than assuming success." },
      { step: "Roll back if needed", detail: "A failed health check can trigger an automatic rollback to the last good deployment." },
    ],
    useCases: [
      "Shipping a side project without learning every provider's own CLI",
      "Standardizing deploy workflows across a team using different providers",
    ],
    limitations: [
      "Every provider requires its own already-authenticated CLI/API session on your machine — PawOS never manages your cloud credentials for you",
      "Providers with no real staging/rollback concept (like a single Fly.io or Render app) honestly report that limitation instead of faking one",
    ],
  },
  {
    slug: "communication",
    title: "Communication",
    tagline: "Meetings and calls become searchable, actionable memory.",
    category: "Collaboration",
    summary:
      "The Communication Runtime captures meetings, phone calls, and face-to-face conversations, transcribes them, and extracts action items, decisions, and follow-ups automatically — with an explicit consent gate before anything is recorded.",
    capabilities: [
      "Desktop-first meeting and call capture with a consent gate",
      "Automatic transcription and speaker timeline extraction",
      "Executive summaries, risks, open questions, and next-agenda generation",
      "Draft follow-up emails linked directly to the session that produced them",
    ],
    workflow: [
      { step: "Consent first", detail: "Recording only starts after explicit, informed consent — never silently." },
      { step: "Capture and transcribe", detail: "Audio is captured and transcribed with speaker attribution." },
      { step: "Extract structure", detail: "Action items, decisions, and follow-ups are pulled from the real transcript." },
      { step: "Follow up", detail: "Paw can draft a follow-up email for your review — it never sends on its own." },
    ],
    useCases: [
      "Never losing track of action items from a meeting again",
      "Searching past conversations for what was actually agreed",
    ],
    limitations: [
      "Requires explicit consent from you (and ideally other participants) before recording",
      "Transcription accuracy depends on audio quality, as with any speech-to-text system",
    ],
  },
  {
    slug: "knowledge",
    title: "Knowledge",
    tagline: "Answers grounded in your own documentation, not guesses.",
    category: "Platform",
    summary:
      "PawOS's Help Center pairs a searchable article corpus with retrieval-augmented answers — support questions are answered by finding and citing real documentation, and unresolved questions escalate to a real support conversation instead of a dead end.",
    capabilities: [
      "A searchable, categorized help article corpus with alias-aware search",
      "Retrieval-augmented AI answers grounded in real articles",
      "A structured support conversation flow with feedback and escalation",
      "Release notes, status, and recommended-articles surfaced proactively",
    ],
    workflow: [
      { step: "Ask a question", detail: "Type a support question in plain language." },
      { step: "Search first", detail: "Paw searches real documentation before generating any answer." },
      { step: "Cite or escalate", detail: "A grounded answer is returned with its source, or the question escalates to support." },
    ],
    useCases: [
      "Self-service support that actually points to real documentation",
      "Reducing repetitive support questions with accurate, cited answers",
    ],
    limitations: [
      "Answers are only as good as the underlying documentation — gaps in docs mean gaps in answers, by design rather than by fabrication",
    ],
  },
  {
    slug: "reasoning",
    title: "Reasoning",
    tagline: "A model router tuned per tier, never exposed as a raw API choice.",
    category: "Platform",
    summary:
      "PawOS routes every request through an internal AI Provider Router. You interact with named Paw models (Flash, Swift, Core, Creative, Vision, Voice) matched to your tier — the underlying provider is an implementation detail, not something you have to manage.",
    capabilities: [
      "Function-calling wired directly into the desktop action engine",
      "Vision capability for image and reference analysis",
      "Streaming responses for natural, low-latency conversation",
      "Tier-based access to higher-capability models on Pro, Pro Max, Team, and Enterprise",
    ],
    workflow: [
      { step: "You ask", detail: "A request comes in as text, voice, or an uploaded image." },
      { step: "Route", detail: "The right Paw model handles it based on the task and your tier." },
      { step: "Respond or act", detail: "The model either answers directly or calls a real tool to take action." },
    ],
    useCases: [
      "Getting the right capability for the job without picking a model yourself",
      "Vision-based tasks like recreating a design from a screenshot",
    ],
    limitations: [
      "Reasoning quality scales with your tier's model access — Go includes no AI models",
    ],
  },
  {
    slug: "automation",
    title: "Automation",
    tagline: "Deterministic workflows for the tasks that shouldn't need improvisation.",
    category: "Engineering",
    summary:
      "Alongside conversational task execution, PawOS runs deterministic workflow plugins for well-defined jobs — multi-source comparison, long-running research, and ticket investigation — so repeatable work gets a repeatable, auditable process instead of ad hoc reasoning every time.",
    capabilities: [
      "A comparison workflow for evaluating multiple sources against defined criteria",
      "Long-running research workflows that persist across a session",
      "Enterprise ticket investigation that pulls real browser console and network evidence",
      "Workflow metadata surfaced directly in the Coding Canvas for visibility",
    ],
    workflow: [
      { step: "Trigger a workflow", detail: "A qualifying request (like \"compare these three options\") triggers the matching deterministic plugin." },
      { step: "Run the steps", detail: "The workflow executes its fixed steps, gathering real evidence at each one." },
      { step: "Present the result", detail: "Results are shown with the workflow's structure intact, not collapsed into free text." },
    ],
    useCases: [
      "Structured comparisons where consistency matters more than creativity",
      "Repeatable investigation processes for recurring ticket types",
    ],
    limitations: [
      "Deterministic workflows only trigger for the specific task shapes they're built for",
    ],
  },
  {
    slug: "companions",
    title: "Companions",
    tagline: "A real, animated 3D presence you can build, upload, and customize.",
    category: "Core",
    summary:
      "Every Paw is a real, rigged 3D character with procedural motion, dynamic facial expression, and lip-sync driven by live speech — customizable through Companion Studio, or replaced entirely with your own uploaded model.",
    capabilities: [
      "Automatic rigging for uploaded OBJ models, or bring your own GLB/GLTF/VRM/FBX",
      "Procedural motion — breathing, sway, and head-look — layered on top of animation clips",
      "Live facial expression and mouth-shape sync during speech",
      "Personality presets and a full companion editor for voice, behavior, and memory",
      "Export/import as a portable .paw companion package",
    ],
    workflow: [
      { step: "Create or upload", detail: "Start from a preset personality or upload your own 3D model." },
      { step: "Customize", detail: "Tune voice, behavior, personality, and appearance in Companion Studio." },
      { step: "Live alongside your work", detail: "Your companion sits, reacts, and speaks as you work, not as a static chat avatar." },
    ],
    useCases: [
      "A companion that actually feels present, not just a chat window with a picture",
      "Sharing a distinctive companion package with teammates",
    ],
    limitations: [
      "AI-generated avatar creation from a photo isn't available yet — upload-your-own-model is the current path for a fully custom look",
    ],
  },
  {
    slug: "safety",
    title: "Safety",
    tagline: "Confirmation gates, an audit log, and a real credential vault.",
    category: "Platform",
    summary:
      "Destructive or production-impacting actions never run silently. PawOS confirms before acting, logs infrastructure actions for audit, and — for Team and Enterprise — enforces governance policies and stores organization credentials in an encrypted vault rather than in plain text.",
    capabilities: [
      "Confirm-then-retry gating for destructive or irreversible actions",
      "A real approval queue for production-impacting infrastructure actions",
      "An encrypted credential vault for organization-shared secrets",
      "Governance policies that can require approval before specific action types run",
      "A full audit log for compliance evidence",
    ],
    workflow: [
      { step: "Detect risk", detail: "PawOS classifies an action as destructive, production-impacting, or routine." },
      { step: "Gate appropriately", detail: "Routine actions proceed; risky ones pause for your explicit confirmation or an org approval." },
      { step: "Log it", detail: "Infrastructure-affecting actions are recorded in an auditable log." },
    ],
    useCases: [
      "Preventing accidental production incidents from an over-eager automation",
      "Meeting basic compliance evidence requirements for regulated teams",
    ],
    limitations: [
      "Safety mechanisms reduce risk; they don't eliminate the need for good judgment about what to automate",
    ],
  },
  {
    slug: "enterprise",
    title: "Enterprise",
    tagline: "One platform for individuals, teams, and organizations of any size.",
    category: "Collaboration",
    summary:
      "PawOS scales from a single Paw on one device to shared Organization Workspaces with real-time presence, shared documents, task assignment, remote assistance, and org-wide governance — without maintaining a separate product for teams.",
    capabilities: [
      "Shared Organization Workspaces with members, projects, and shared documents",
      "Live presence and cursors on shared documents via CRDT sync",
      "Task lifecycle, assignment, and temporary permission grants",
      "Screen-share-based remote assistance with a shared terminal",
      "Org-wide credential vault, approval policies, and audit logging",
    ],
    workflow: [
      { step: "Create a workspace", detail: "An organization owner sets up a shared workspace scoped to their email domain." },
      { step: "Invite the team", detail: "Members join and get access shaped by their role and any temporary grants." },
      { step: "Collaborate live", detail: "Shared documents, tasks, and credit pools work across every member's own PawOS instance." },
    ],
    useCases: [
      "A small team sharing companions, credits, and CRM context",
      "A larger organization enforcing approval policies before infrastructure changes",
    ],
    limitations: [
      "Organization membership is restricted to a verified shared email domain, by design, to keep workspace membership meaningful",
    ],
  },
  {
    slug: "billing",
    title: "Billing",
    tagline: "Transparent tiers, prepaid task credits, and success-only billing.",
    category: "Platform",
    summary:
      "PawOS's pricing is a real, published tier ladder — not usage-metered chat. Autonomous Engineering Tasks run on prepaid credits and are billed only when they genuinely complete successfully, never for chat, research, or manual coding help, and never for a run that fails, is cancelled, or is denied approval.",
    capabilities: [
      "A real tier ladder: Go (free), Pro, Pro Max, and per-seat Team and Enterprise plans",
      "Instant self-serve upgrade, downgrade, and renewal — no sales call required",
      "Prepaid Autonomous Engineering Task credits ($5/credit, $30 minimum) that never expire",
      "A full purchase and usage history export with per-run detail",
    ],
    workflow: [
      { step: "Pick a plan", detail: "Choose the tier that matches your usage — upgrade or downgrade anytime." },
      { step: "Buy task credits", detail: "Purchase prepaid Autonomous Engineering Task credits upfront, anytime, from inside the app." },
      { step: "Pay only for completed work", detail: "A credit is consumed only for a task that genuinely finished successfully." },
    ],
    useCases: [
      "Predictable monthly cost for individual and team use",
      "Scaling autonomous engineering work without per-token billing surprises",
    ],
    limitations: [
      "Starting a new Autonomous Engineering Task requires at least 1 remaining prepaid credit",
    ],
  },
  {
    slug: "autonomous-engineering",
    title: "Autonomous Engineering",
    tagline: "PawOS's flagship capability: real tickets, resolved end to end.",
    category: "Engineering",
    summary:
      "Given a ticket from a connected tracker, Paw investigates the issue using real evidence — browser console output, network requests, repository history — plans a fix, implements it, tests it, opens a real pull request, and reports back. It's billed only when that full cycle genuinely completes.",
    capabilities: [
      "Real, tracker-agnostic ticket investigation (Jira, Linear, GitHub Issues, Azure Boards, and more)",
      "Root-cause correlation across logs, code, and deployment history",
      "Implementation, testing, and a real pull request as the deliverable",
      "Structured engineering reports capturing what was found and what was done",
      "Success-gated billing tied to a completed PR and updated ticket — never to deploy alone",
    ],
    workflow: [
      { step: "Investigate", detail: "Paw gathers real evidence about the reported issue before proposing anything." },
      { step: "Plan", detail: "A concrete implementation plan is drafted and tracked as a live TODO list." },
      { step: "Implement & test", detail: "Paw writes the fix and runs real tests against it." },
      { step: "Deliver", detail: "A pull request is opened and the ticket is updated — that's when the task counts as complete." },
    ],
    useCases: [
      "Working through a backlog of well-defined bugs without a human picking up every ticket",
      "Consistent, evidenced investigation quality across a large ticket volume",
    ],
    limitations: [
      "Best suited to well-scoped, well-defined tickets — ambiguous or highly exploratory work still benefits from a human in the loop",
      "Requires a connected repository and ticket tracker to run end to end",
    ],
  },
];

export function getFeatureBySlug(slug: string): FeatureContent | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
