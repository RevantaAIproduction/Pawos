export type Article = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string[];
};

export const ARTICLES: Article[] = [
  {
    slug: "introducing-pawos",
    title: "Introducing PawOS",
    category: "Announcements",
    excerpt: "Why we built a desktop companion instead of another chat window.",
    body: [
      "Most AI products today live in a browser tab. You describe a problem, get a suggestion, and then do the actual work of applying it yourself — copying code into your editor, running the command it suggested, clicking through the settings it described.",
      "PawOS starts from a different premise: an AI companion should be able to act, not just advise. It runs as a native desktop application, aware of what you're working on, able to open applications, edit files, run commands, control a browser, and deploy real infrastructure — with your confirmation at every risky step.",
      "This isn't a rebrand of a chatbot with a system-tray icon. Six independently real runtimes back it: Universal Execution for files/apps/terminals, a Browser Runtime for real browser control, an Infrastructure Runtime for deployment across 20+ providers, a Communication Runtime for meetings and calls, a Companion Runtime for the animated 3D presence you actually see, and a Governance Runtime for the confirmation gates and audit trail that make trusting it with real work reasonable.",
      "We're publishing this documentation site alongside the product because we think the honest version of an AI companion's capabilities — including what it can't yet do — is more useful than a highlight reel. You'll find that tone throughout: every feature page lists real limitations next to real capabilities.",
    ],
  },
  {
    slug: "future-of-desktop-ai",
    title: "The Future of Desktop AI",
    category: "Product",
    excerpt: "Why the next wave of AI assistants will live on your machine, not in your browser.",
    body: [
      "Browser-based AI assistants hit a structural ceiling: a web page can't reliably see your file system, run your build tool, or control another application on your desktop. Every one of those limitations exists because the assistant runs in a sandboxed tab, not because the underlying model isn't capable enough.",
      "Desktop AI removes that sandbox. When an assistant runs as a native application, it can genuinely act on your machine — with the same permission boundaries a human user would need, and the same responsibility to ask before doing something risky.",
      "This shift matters most for work that's inherently local: development environments, file organization, desktop automation, and anything that depends on state your browser simply can't see. It's not that desktop AI replaces cloud AI — PawOS still routes reasoning through cloud models — it's that the execution layer belongs on the device doing the work.",
      "We expect more serious AI products to follow this pattern as users get tired of the copy-paste tax that browser-bound assistants impose.",
    ],
  },
  {
    slug: "why-autonomous-engineering-matters",
    title: "Why Autonomous Engineering Matters",
    category: "Product",
    excerpt: "The difference between an AI that suggests code and one that closes tickets.",
    body: [
      "Code-suggestion tools have gotten very good at the suggestion part. What they haven't solved is the rest of the ticket lifecycle: understanding what's actually broken, verifying the fix works, and getting it into a state a human reviewer can approve.",
      "Autonomous Ticket Resolution is PawOS's attempt at the full cycle: investigate a real ticket with real evidence (browser console output, network requests, repository history), plan a fix, implement it, test it, and open a real pull request — with the ticket updated to reflect the work.",
      "The billing model reflects this philosophy directly: you're charged once, only when that full cycle genuinely completes. A partial investigation, a failed test run, or a denied deploy approval never bills. That's a deliberate choice — outcome-based pricing forces the product to actually finish the job, not just produce plausible-looking output.",
      "We don't think this replaces engineers. We think it removes the most repetitive slice of ticket triage — the well-scoped, well-understood bugs that pile up faster than any team can burn them down — so engineers spend more time on the harder problems that actually need human judgment.",
    ],
  },
  {
    slug: "planning-vs-execution",
    title: "Planning vs Execution",
    category: "Engineering",
    excerpt: "Why PawOS always shows its plan before it starts acting.",
    body: [
      "It's tempting to build an AI agent that just does the thing you asked, as fast as possible. We deliberately didn't build PawOS that way.",
      "Every non-trivial request goes through a visible planning stage first: the request gets broken into concrete steps, tracked as a live TODO list, before any action runs. This isn't just a UX nicety — it's the mechanism that makes confirmation gates meaningful. You can't sensibly confirm or deny a destructive action if you don't know what's about to happen.",
      "Planning and execution are also separated internally: a plan can be revised mid-task if execution reveals something the plan didn't anticipate, rather than forcing reality to match an outdated guess. And task status only ever reports \"Completed\" once the actual execution results support it — a plan finishing isn't the same as the work finishing.",
      "The tradeoff is speed: showing a plan and gating risky steps takes longer than just running everything blind. We think that tradeoff is obviously correct for anything touching production infrastructure, and still correct — just less obviously — for everyday desktop tasks.",
    ],
  },
  {
    slug: "building-safe-ai-systems",
    title: "Building Safe AI Systems",
    category: "Safety",
    excerpt: "The concrete mechanisms behind PawOS's safety claims.",
    body: [
      "\"Safe AI\" is often used as a marketing phrase without concrete backing. Here's what it actually means inside PawOS.",
      "Every action is classified before it runs: routine, destructive, or production-impacting. Routine actions (reading a file, searching the web) proceed without friction. Destructive actions (deleting data, force-pushing) require explicit confirmation, every time. Production-impacting actions (deploying, rolling back) can additionally require organization-level approval before they run at all.",
      "This isn't a single global toggle — it's enforced per action type, and for organizations, backed by a real approval queue and audit log rather than a client-side checkbox. Credentials for organization infrastructure are stored in an encrypted vault, never in plain text, and accessed only through gated actions.",
      "Just as important as what PawOS gates is what it refuses to fabricate: a task's status only ever reflects what genuinely happened, evidence is preserved even when a step partially fails, and a failed run is reported as failed rather than silently retried into a false success. Safety, in our view, includes not lying about outcomes.",
    ],
  },
  {
    slug: "privacy-first-ai",
    title: "Privacy First AI",
    category: "Privacy",
    excerpt: "What stays on your device, and what doesn't.",
    body: [
      "Most of what PawOS learns about you — your projects, your companion's memory, your workspace context — stays local on your device by default. It only leaves your machine when you explicitly share it into a Team or Enterprise Organization Workspace.",
      "Reasoning still routes through cloud AI providers, because running frontier models locally isn't yet practical for most hardware — that's a real tradeoff, not something we pretend doesn't exist. What we control is everything around that: memory, credentials, and file access stay local-first, and organization data is scoped with row-level security so one workspace can never see another's.",
      "We'd rather state these tradeoffs plainly than claim an unqualified \"100% private\" that doesn't survive scrutiny. See our Privacy Policy and Security documentation for the full detail.",
    ],
  },
  {
    slug: "local-vs-cloud-ai",
    title: "Local vs Cloud AI",
    category: "Engineering",
    excerpt: "PawOS's hybrid approach, and why we didn't pick one side.",
    body: [
      "The local-vs-cloud AI debate usually gets framed as a binary choice. PawOS's architecture treats it as a layering problem instead: execution is local, reasoning is cloud-routed, and memory sits local-first with an explicit opt-in to share.",
      "Execution has to be local because that's where the file system, the terminal, and the browser you're actually using live. Reasoning is cloud-routed because that's where the capable models are, today. Pretending either constraint doesn't exist would mean either a much weaker assistant or a much less honest one.",
      "This is also why PawOS routes reasoning through named Paw models rather than exposing raw provider choice — the router can change which provider backs \"Paw Core\" without that being a decision you have to manage, while the local execution layer stays exactly where it needs to be: on your machine.",
    ],
  },
  {
    slug: "understanding-runtimes",
    title: "Understanding Runtimes",
    category: "Engineering",
    excerpt: "Why PawOS is built from six independent systems instead of one big prompt.",
    body: [
      "It would be simpler, in one sense, to build PawOS as a single large prompt with a big toolbox of functions. We built it as six focused runtimes instead: Universal Execution, Browser, Infrastructure, Communication, Companion, and Governance.",
      "The reason is reliability. A single monolithic prompt has no natural boundary for what \"done\" means, no natural place to put a permission gate, and no natural place to specialize behavior for a domain (deployment safety looks nothing like meeting-consent handling). Separate runtimes each get their own execution flow, their own honest limitations, and their own recovery logic — see each runtime's documentation for the specifics.",
      "It also means growth is additive rather than a rewrite: adding a new deployment provider extends the Infrastructure Runtime's connector interface; it doesn't touch how meetings get transcribed.",
    ],
  },
  {
    slug: "how-pawos-executes-tasks",
    title: "How PawOS Executes Tasks",
    category: "Engineering",
    excerpt: "The real pipeline from request to result.",
    body: [
      "A request enters through conversation (typed or spoken), gets routed to the relevant runtime, and — for anything non-trivial — produces a visible plan before anything runs.",
      "Execution happens through plugins, each implementing the same prepare/execute/observe/recover contract: check requirements are actually met, describe the action in plain language, run it, and observe the real result rather than assuming success. If something fails, a real recovery attempt runs before the failure is reported honestly.",
      "Confirmation gates sit between planning and execution for anything destructive or production-impacting. For organizations, an additional approval layer can require a human sign-off before specific action types run at all.",
      "The result: task status in the Coding Canvas reflects genuine progress, not optimistic guessing — a step shows as complete only once its real output supports that.",
    ],
  },
  {
    slug: "enterprise-automation",
    title: "Enterprise Automation",
    category: "Enterprise",
    excerpt: "Scaling PawOS from one device to a whole organization.",
    body: [
      "Individual and enterprise use of PawOS run on the same runtimes — there's no separate enterprise product to maintain. What changes at organization scale is the layer of shared state and governance on top: shared workspaces, task assignment, a credential vault, approval policies, and an audit log.",
      "This matters for automation specifically: a policy that requires approval before production deploys, or an audit log that records every infrastructure action, only make sense once more than one person can trigger consequential work. PawOS's governance layer is designed for exactly that transition — from \"my own companion doing my own work\" to \"our organization's companions doing shared work, safely.\"",
      "Membership itself is scoped to a verified, shared email domain by design, so an organization workspace stays a meaningful unit as it grows from ten people to a hundred.",
    ],
  },
  {
    slug: "voice-first-computing",
    title: "Voice First Computing",
    category: "Product",
    excerpt: "Designing voice interaction that feels like a conversation, not a command line.",
    body: [
      "Most voice assistants either force short, brittle commands or make you wait through a full response before anything is spoken back. PawOS uses push-to-talk for capture and streaming, sentence-chunked speech synthesis for replies — so the companion starts speaking as soon as the first sentence is ready, not after the whole response is generated.",
      "Viseme timing keeps the companion's mouth shape synced to actual speech, which sounds like a small detail until you notice its absence in most talking-avatar products. Voice, speed, and emotional tone are configurable per companion, because a voice that fits an assistant persona doesn't fit a creative-collaborator persona.",
      "None of this replaces typing — push-to-talk is additive, not a forced interaction mode — but for hands-busy moments, it's the difference between an assistant that feels responsive and one that feels like a phone tree.",
    ],
  },
  {
    slug: "desktop-ai-best-practices",
    title: "Desktop AI Best Practices",
    category: "Guides",
    excerpt: "Getting the most reliable results from a companion with real desktop access.",
    body: [
      "Be specific about scope. \"Clean up my downloads folder\" is more reliable than \"organize my computer\" — desktop AI works best with a bounded, describable target.",
      "Let confirmation gates do their job. Reviewing what's about to happen before confirming a destructive action isn't friction to route around; it's the mechanism that makes automation trustworthy enough to actually delegate to.",
      "Name your projects and keep folder structures reasonably conventional. Project understanding in the Coding Canvas works better with a project it can recognize than with an unlabeled folder soup.",
      "Report what didn't work. An honest \"that failed because X\" from PawOS is more useful than a vague success — treat those messages as real diagnostic information, not an apology to skip past.",
    ],
  },
  {
    slug: "choosing-ai-providers",
    title: "Choosing AI Providers",
    category: "Engineering",
    excerpt: "Why PawOS abstracts the provider choice instead of exposing it.",
    body: [
      "Most AI products that let you \"bring your own model\" push a decision onto you that you're rarely equipped to make well: which provider is actually best for this specific task, today, at this price point.",
      "PawOS routes internally instead — named Paw models (Flash, Swift, Core, Creative, Vision, Voice) map to the right underlying capability for the task and your tier, and that routing can improve over time without you having to re-choose anything.",
      "This isn't a permanent lock-out of provider choice as a concept — it's a bet that most users want good results more than they want to manage a model marketplace themselves. Infrastructure and integration connectors work the opposite way, deliberately: you choose your own real hosting provider, ticket tracker, and source control system, because those are decisions with real, provider-specific consequences that shouldn't be abstracted away.",
    ],
  },
  {
    slug: "ai-safety",
    title: "AI Safety",
    category: "Safety",
    excerpt: "What we mean when we say PawOS is honest by design.",
    body: [
      "A recurring theme across PawOS's design is refusing to let the product look more capable than it is. Task status never reports completion for unfinished work. A failed deploy is reported as failed, not silently retried into a misleading success. A runtime that can't yet do something — SSO, AI avatar generation, a public API — says so plainly in its own documentation rather than staying vague.",
      "We treat this as a safety property, not just a UX preference: an assistant that can act on real infrastructure has to be trustworthy about what it actually did, or the confirmation gates protecting you from its mistakes are meaningless.",
      "Concretely, this shows up as: honest limitations sections on every feature and runtime doc, a billing model that never charges for a failed or cancelled Autonomous Engineering Task, and structured engineering reports that record what was actually found and changed — not a marketing summary of it.",
    ],
  },
  {
    slug: "engineering-workflows",
    title: "Engineering Workflows",
    category: "Engineering",
    excerpt: "How PawOS fits into a real development process.",
    body: [
      "PawOS isn't a replacement for your existing engineering workflow — it's a participant in it. It reads real repository history through your source control connector, checks real CI/CD status rather than guessing, and opens real pull requests that go through your existing review process.",
      "For day-to-day development, that means: asking Paw to run a build shows real output, not a summary; asking it to check test status reads actual test results; asking it to deploy runs through your actual hosting provider's CLI or API.",
      "For Autonomous Ticket Resolution specifically, the workflow ends at a pull request and an updated ticket — deliberately not at a merge or a deploy, so teams that require human review before either of those steps aren't bypassed by the automation.",
    ],
  },
  {
    slug: "release-announcement-pawos-web",
    title: "Release Announcement: pawos.app is live",
    category: "Announcements",
    excerpt: "The PawOS documentation and marketing site is now public.",
    body: [
      "This site — pawos.app — is now live: a full features catalog, a documentation system covering every runtime, a knowledge base, this blog, pricing, and (once builds are published) downloads.",
      "The desktop application remains the product; this site exists to explain it honestly, including what it can't yet do. Expect this to keep growing alongside the app itself — new runtime capabilities, new deployment providers, and new documentation as features ship.",
    ],
  },
  {
    slug: "roadmap-update-deployment-providers",
    title: "Roadmap Update: 20+ real deployment providers",
    category: "Roadmap",
    excerpt: "The Infrastructure Runtime now spans a genuinely provider-agnostic set of real integrations.",
    body: [
      "The Infrastructure Runtime's HostingConnector interface now backs real integrations across Vercel, Netlify, Railway, Render, Fly.io, GitHub Pages, Hostinger (shared hosting and VPS), Google Cloud Run, AWS Elastic Beanstalk, Azure App Service, Kubernetes, and real cloud-VM provisioning for AWS EC2, Google Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud, and generic Docker/VPS hosts.",
      "Every one of these shells to that provider's own official, already-authenticated CLI or API — none of them are simulated or partially implemented. Where a provider genuinely has no staging/rollback concept, the connector reports that honestly instead of fabricating one.",
      "See the full Roadmap page for what's coming next.",
    ],
  },
  {
    slug: "product-update-autonomous-engineering-billing",
    title: "Product Update: success-gated Autonomous Engineering Task billing",
    category: "Product",
    excerpt: "How we closed the deploy-boundary loophole in usage-based billing.",
    body: [
      "Autonomous Engineering Task billing is now fully success-gated at the database level: two separate functions handle marking a run \"completed\" (which requires a real PR and an updated ticket) versus \"terminal\" (failed, cancelled, or retry-limit-reached) — deliberately two functions rather than one with a client-settable flag, so no client call can ever mark a run both terminal and billable at once.",
      "Completion deliberately never requires a deploy to have happened — only a real PR and a real ticket update — closing a loophole where teams that gate their own deploys separately would otherwise never get billed for genuinely completed engineering work.",
      "Autonomous Engineering Tasks now run on prepaid task credits ($5/credit, $30 minimum) rather than a monthly allowance — credits don't expire, and balance, purchase history, and usage history are all visible in-app with full CSV export.",
    ],
  },
  {
    slug: "case-studies",
    title: "Case Studies",
    category: "Enterprise",
    excerpt: "What we can share today, and what's coming.",
    body: [
      "We don't have public customer case studies to share yet — PawOS is early, and we'd rather wait for real, attributable results than publish something vague or anonymized to fill this space.",
      "For a sense of what a real workflow looks like in the meantime, walk through the Autonomous Ticket Resolution documentation, which describes the actual investigate-plan-implement-test-deliver cycle a real ticket goes through, end to end.",
      "As real deployments produce results worth sharing — with permission — this page will carry them, with real numbers and real attribution, not composite or illustrative accounts presented as genuine.",
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
