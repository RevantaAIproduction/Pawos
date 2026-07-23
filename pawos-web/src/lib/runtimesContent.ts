export type RuntimeDoc = {
  slug: string;
  name: string;
  purpose: string;
  capabilities: string[];
  providers: string[];
  architecture: string;
  executionFlow: { step: string; detail: string }[];
  examples: string[];
  useCases: string[];
  limitations: string[];
  bestPractices: string[];
  futureImprovements: string[];
};

export const RUNTIMES: RuntimeDoc[] = [
  {
    slug: "universal-execution",
    name: "Universal Execution Runtime",
    purpose: "The general-purpose desktop actuator behind file, application, process, and terminal actions.",
    capabilities: [
      "Open apps, folders, and files, including opening a project in an editor",
      "Run allowlisted shell commands with shell selection (bash, PowerShell, cmd)",
      "Safe file lifecycle operations with copy verification and conflict policies",
      "Process lifecycle management with health checks",
      "A recovery loop that retries and repairs failed steps",
    ],
    providers: ["Local OS shell (bash / PowerShell / cmd)", "Native file system", "OS process manager"],
    architecture:
      "A plugin-based execution engine: each capability (open app, run command, copy file, watch process) is an independent plugin implementing a common prepare/execute/observe/recover contract. A central engine sequences plugins, checks requirements before running, and narrates each step.",
    executionFlow: [
      { step: "Requirement check", detail: "The engine verifies the tools and permissions a plugin needs exist before attempting anything." },
      { step: "Describe", detail: "A plain-language description of the planned action is generated for confirmation gating." },
      { step: "Execute", detail: "The plugin runs, streaming output where applicable." },
      { step: "Observe & recover", detail: "Real observation of the result determines success; a failure attempts a real recovery step before reporting." },
    ],
    examples: [
      "\"Install this npm package and restart the dev server.\"",
      "\"Merge these two folders, keeping the newer file on conflict.\"",
      "\"Open this project in VS Code and start the build.\"",
    ],
    useCases: ["Local development environment setup", "Everyday file organization", "Running and monitoring long-lived dev servers"],
    limitations: ["Command execution is allowlisted by design", "No remote execution — actions run on the local machine only"],
    bestPractices: ["Let Paw narrate destructive actions before confirming", "Use named projects so Paw can resolve \"my project\" reliably"],
    futureImprovements: ["Broader allowlisted command coverage", "Cross-device execution for paired machines"],
  },
  {
    slug: "browser-runtime",
    name: "Browser Runtime",
    purpose: "An adapter-based connection to a real, controllable browser session.",
    capabilities: [
      "Navigate, search, read, and extract structured data from pages",
      "Fill forms, click elements, scroll, and wait for page state",
      "Multi-tab session management and generic script evaluation",
      "A deterministic comparison workflow for evaluating multiple sources",
    ],
    providers: ["Chromium via CDP (Chrome DevTools Protocol)", "Configurable fallback browser order (e.g. Edge)"],
    architecture:
      "A BrowserRuntime facade sits over swappable browser adapters (currently a Chromium CDP adapter), so the same plugin surface works regardless of which local browser is actually driven.",
    executionFlow: [
      { step: "Session start", detail: "A real browser session is opened or reused." },
      { step: "Navigate & read", detail: "Pages are loaded and their content read or extracted per the request." },
      { step: "Permission gate", detail: "Actions that submit forms or change external state require confirmation." },
      { step: "Structured return", detail: "Extracted data or a completed action is returned, not just page text." },
    ],
    examples: [
      "\"Compare pricing across these three vendor sites.\"",
      "\"Fill out this form with my saved details.\"",
      "\"Find the release notes for this library's latest version.\"",
    ],
    useCases: ["Multi-source research", "Repetitive form filling", "Structured data extraction from web pages"],
    limitations: ["Desktop-scoped — drives one local browser session, not a headless fleet", "Sites with aggressive bot detection may still block automation"],
    bestPractices: ["Be specific about what data you want extracted, not just \"look at this page\"", "Use the comparison workflow for structured side-by-side evaluation"],
    futureImprovements: ["Additional browser adapters", "Session persistence across restarts"],
  },
  {
    slug: "infrastructure-runtime",
    name: "Infrastructure Runtime",
    purpose: "Provider-agnostic deployment, provisioning, and production investigation.",
    capabilities: [
      "Deploy through a single interface across 20+ real hosting/cloud providers",
      "Provision real cloud VMs (EC2, Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud) and deploy to them over SSH + Docker",
      "Automatic post-deploy health checks with rollback",
      "Real ticket investigation using browser console, network, and repository evidence",
    ],
    providers: [
      "Vercel, Netlify, Railway, Render, Fly.io, GitHub Pages, Hostinger",
      "Google Cloud Run, AWS Elastic Beanstalk, Azure App Service, Kubernetes",
      "AWS EC2, Google Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud, Docker/VPS, Hostinger VPS",
    ],
    architecture:
      "Every provider implements the same small HostingConnector interface (deploy / getLatestDeployment / rollback / promote), shelling to that provider's own official, already-authenticated CLI or API. Cloud-VM connectors share a common SSH + Docker deploy helper so provisioning a new VM and deploying to an existing one use identical mechanics after the instance exists.",
    executionFlow: [
      { step: "Classify the request", detail: "Paw determines the right provider and whether this is a first deploy or a redeploy." },
      { step: "Safety gate", detail: "Production-impacting deploys go through an approval gate." },
      { step: "Deploy", detail: "The provider's own CLI/API performs the real deploy." },
      { step: "Verify & rollback", detail: "A real health check runs after deploy; a failure can trigger automatic rollback." },
    ],
    examples: [
      "\"Deploy this to Vercel.\"",
      "\"Roll back the production deployment.\"",
      "\"Investigate why the checkout page is throwing errors in production.\"",
    ],
    useCases: ["Shipping side projects without learning every provider's CLI", "Standardizing deploys across a team using different providers", "Root-cause investigation of production issues"],
    limitations: ["Every provider requires its own already-authenticated CLI/API session on your machine", "Providers with no real staging/rollback concept honestly report that limitation"],
    bestPractices: ["Authenticate each provider's CLI once, outside of PawOS, before your first deploy", "Use approval policies for any provider your organization treats as production"],
    futureImprovements: ["More PaaS adapters as they're requested", "Deeper cost visibility across providers"],
  },
  {
    slug: "communication-runtime",
    name: "Communication Runtime",
    purpose: "Turns meetings, calls, and conversations into searchable, actionable memory.",
    capabilities: [
      "Desktop-first meeting and call capture with an explicit consent gate",
      "Automatic transcription and speaker timeline extraction",
      "Executive summaries, risks, open questions, and next-agenda generation",
      "Draft follow-up emails linked to the originating session",
    ],
    providers: ["Local microphone/system audio capture", "Configurable speech-to-text provider", "Meeting platform adapters (Meet, Zoom, Teams, Webex) where supported"],
    architecture:
      "Desktop-first capture (not a bot joining your call) feeds a transcription and intelligence pipeline that extracts structured entries — action items, decisions, follow-ups — into session-scoped storage, cross-referenced against a contacts/companies memory store.",
    executionFlow: [
      { step: "Consent", detail: "Recording only starts after explicit, informed consent." },
      { step: "Capture", detail: "Desktop audio capture runs alongside the call or meeting." },
      { step: "Transcribe & extract", detail: "A real transcript is produced and structured entries are pulled from it." },
      { step: "Follow up", detail: "A draft follow-up can be prepared for your review — never sent automatically." },
    ],
    examples: ["\"Record this meeting.\"", "\"What did we decide about the Q3 roadmap last week?\"", "\"Draft a follow-up email for this call.\""],
    useCases: ["Never losing meeting action items", "Building relationship history automatically"],
    limitations: ["Requires explicit consent before any recording starts", "Transcription accuracy depends on audio quality"],
    bestPractices: ["Get verbal consent from other participants before recording a call", "Review drafted follow-ups before sending — PawOS never sends on your behalf"],
    futureImprovements: ["Broader meeting platform coverage", "Mobile companion phone-call capture"],
  },
  {
    slug: "companion-runtime",
    name: "Companion Runtime",
    purpose: "A real, animated 3D presence with procedural motion and live lip-sync.",
    capabilities: [
      "Automatic rigging for uploaded OBJ models, or bring your own GLB/GLTF/VRM/FBX",
      "Procedural motion — breathing, sway, head-look — layered on animation clips",
      "Live facial expression and mouth-shape sync during speech",
      "Export/import as a portable .paw companion package",
    ],
    providers: ["Local three.js rendering", "Configurable TTS provider for voice"],
    architecture:
      "An AssetManager/AnimationLibrary loads and rigs 3D models; an AnimationStateMachine handles crossfade/queue/loop/interrupt between clips; a ProceduralMotion layer adds continuous idle motion on top; a DynamicFaceTexture compositor renders live facial expression, driven by the same conversation state that drives speech.",
    executionFlow: [
      { step: "Load", detail: "A companion's model, rig, and personality profile load." },
      { step: "Idle", detail: "Procedural motion keeps the companion alive-feeling even without active animation." },
      { step: "React", detail: "Conversation state (thinking, speaking, listening) drives animation and facial expression in real time." },
    ],
    examples: ["Uploading a custom VRM model as your companion", "Switching personality presets", "Exporting a companion package to share"],
    useCases: ["A distinctive, personal desktop presence", "Sharing a companion configuration with teammates"],
    limitations: ["AI-generated avatar creation from a photo isn't available yet"],
    bestPractices: ["Use a rigged GLB/VRM for the most reliable animation results", "Keep custom models within reasonable polygon budgets for smooth animation"],
    futureImprovements: ["AI avatar generation", "A companion marketplace/gallery"],
  },
  {
    slug: "governance-runtime",
    name: "Governance Runtime",
    purpose: "Approval gates, audit logging, and encrypted credential storage for organizations.",
    capabilities: [
      "Confirm-then-retry gating for destructive or irreversible actions",
      "A real approval queue for production-impacting infrastructure actions",
      "An encrypted credential vault for organization-shared secrets",
      "A full, exportable audit log for compliance evidence",
    ],
    providers: ["Supabase (organization data, RLS-enforced)", "Local confirmation gating for individual use"],
    architecture:
      "Individual-use gating (confirm-then-retry) is local and always on. Organization-scoped governance layers on top: a credential vault encrypts secrets at rest, governance policies can require approval before specific action types run, and every infrastructure-affecting action can be recorded to an audit log — all enforced through Supabase row-level security scoped to the organization.",
    executionFlow: [
      { step: "Classify risk", detail: "An action is classified as routine, destructive, or production-impacting." },
      { step: "Gate", detail: "Routine actions proceed; risky ones require explicit confirmation or an org approval." },
      { step: "Log", detail: "Infrastructure-affecting actions are recorded for audit." },
    ],
    examples: ["\"Require approval before any production deploy.\"", "\"Show me the audit log for this workspace.\""],
    useCases: ["Meeting basic compliance evidence requirements", "Preventing accidental production incidents"],
    limitations: ["Reduces risk; doesn't replace good judgment about what to automate", "SSO enablement is in progress — see the security page for current status"],
    bestPractices: ["Scope approval policies to genuinely risky action types, not everything, to avoid approval fatigue"],
    futureImprovements: ["Full SSO", "Finer-grained per-action audit filtering"],
  },
];

export function getRuntimeBySlug(slug: string): RuntimeDoc | undefined {
  return RUNTIMES.find((r) => r.slug === slug);
}
