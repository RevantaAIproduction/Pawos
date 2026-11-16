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
    excerpt: "The product problem PawOS is working on, and where its three experiences fit.",
    body: [
      "Most AI products today live in a browser tab. You describe a problem, get a suggestion, and then do the actual work of applying it yourself — copying code into your editor, running the command it suggested, clicking through the settings it described.",
      "PawOS helps with supported engineering tasks, from understanding a project to making a change and reviewing the result. The actions available depend on the product experience, permissions and connected services.",
      "Desktop is a Windows app for supported local workflows. CLI works in the local folder where it is started. Web offers browser chat and GitHub-connected repository workflows; it cannot access your local files or terminal.",
      "We're publishing this documentation site alongside the product because we think the honest version of an AI companion's capabilities — including what it can't yet do — is more useful than a highlight reel. You'll find that tone throughout: every feature page lists real limitations next to real capabilities.",
    ],
  },
  {
    slug: "future-of-desktop-ai",
    title: "Desktop AI and Local Work",
    category: "Product",
    excerpt: "How local project work differs from browser-based repository work.",
    body: [
      "PawOS offers different ways to work with a project. Desktop and CLI can work with supported local files and commands on your Windows machine. Web works in a browser with connected repositories and does not access your computer's filesystem or terminal.",
      "Those boundaries matter when choosing an experience. Use Desktop for a graphical local workspace, CLI when you prefer the terminal, and Web for browser chat or a GitHub-connected change.",
      "The products share an account, but they do not have identical capabilities. Check the current guides for platform, plan and connection requirements before starting a workflow.",
    ],
  },
  {
    slug: "why-autonomous-engineering-matters",
    title: "Ticket Work with PawOS",
    category: "Product",
    excerpt: "What ticket-based work can do today, and where human review remains necessary.",
    body: [
      "Code-suggestion tools have gotten very good at the suggestion part. What they haven't solved is the rest of the ticket lifecycle: understanding what's actually broken, verifying the fix works, and getting it into a state a human reviewer can approve.",
      "Autonomous Work can use supported ticket and repository connections to gather context and carry out configured steps. Some actions require approval, and a run may stop when access or a required capability is missing.",
      "A successful fix or pull request is not guaranteed for every ticket. Review the run report to see what changed, which checks ran and what still needs attention. Current usage rates and billing rules appear in the app; Enterprise usage follows separate organization terms.",
      "The workflow is intended to assist with well-scoped engineering tasks. Engineers remain responsible for reviewing proposed changes and deciding whether they are ready to merge or deploy.",
    ],
  },
  {
    slug: "planning-vs-execution",
    title: "Planning and Execution",
    category: "Engineering",
    excerpt: "How planning and approval fit into supported PawOS workflows.",
    body: [
      "It's tempting to build an AI agent that just does the thing you asked, as fast as possible. We deliberately didn't build PawOS that way.",
      "Some multi-step requests are broken into steps before work begins. When PawOS asks for approval, review the proposed action and its scope before continuing.",
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
      "PawOS uses permission and approval controls for supported actions. The controls vary by action, product experience and organization configuration, so review the prompt shown in the app before allowing a change.",
      "Organization features can add approval and audit controls. Their availability and scope depend on the plan and configuration; consult the current security documentation rather than treating this article as a security guarantee.",
      "AI-generated plans and changes can be incomplete or wrong. Review the resulting work and the checks PawOS reports before relying on it.",
    ],
  },
  {
    slug: "privacy-first-ai",
    title: "Privacy First AI",
    category: "Privacy",
    excerpt: "How information handling varies across PawOS features.",
    body: [
      "Information handling depends on the PawOS feature. Web stores chat records and uploaded images to support product features, and AI requests may include the prompt and context needed for the requested task.",
      "Local execution does not mean all related information stays on your device. Connected services and AI providers process information according to the feature and their own terms.",
      "Review the Privacy Policy and Security page for current storage, provider and deletion details. This article is a short overview, not a promise that information never leaves your device.",
    ],
  },
  {
    slug: "local-vs-cloud-ai",
    title: "Local vs Cloud AI",
    category: "Engineering",
    excerpt: "Where PawOS runs and what each experience can access.",
    body: [
      "PawOS Desktop and CLI support local project workflows on Windows. PawOS Web works in the browser with connected repositories and does not access a local filesystem or terminal.",
      "AI requests and connected services may process information outside your device. The exact handling depends on the feature and provider; see the Security and Privacy pages for the current details.",
    ],
  },
  {
    slug: "understanding-runtimes",
    title: "Understanding Runtimes",
    category: "Engineering",
    excerpt: "How PawOS uses separate capability areas for different kinds of work.",
    body: [
      "PawOS has separate capability areas for work such as coding, browser tasks, infrastructure and communication. Which areas are available depends on the application, plan, configuration and connected tools.",
      "Separating workflows helps make their requirements and boundaries clearer. It does not mean every workflow is available in every PawOS experience or that every provider is supported.",
      "See the guides for each workflow to check its current requirements and limitations.",
    ],
  },
  {
    slug: "how-pawos-executes-tasks",
    title: "How PawOS Executes Tasks",
    category: "Engineering",
    excerpt: "The real pipeline from request to result.",
    body: [
      "A request is handled according to the PawOS experience and capabilities involved. Some workflows show a plan before work begins.",
      "When a task runs, review its output and status. PawOS can report errors or stop when a required tool, permission or approval is unavailable.",
      "Approval requirements vary by action and organization configuration. Check the prompt shown in the app before allowing a state-changing action.",
      "A reported result is evidence about that run, not a guarantee that the change is correct or ready to ship. Review the work using your team's normal process.",
    ],
  },
  {
    slug: "enterprise-automation",
    title: "Enterprise Automation",
    category: "Enterprise",
    excerpt: "Scaling PawOS from one device to a whole organization.",
    body: [
      "Team and Enterprise plans add organization workspaces and administration features. Available controls depend on the selected plan and configuration.",
      "Ask the PawOS team which approval, audit, credential and collaboration features are currently available for your intended workflow. Do not assume every feature applies to every organization or provider.",
      "Team is offered for 2–150 seats and Enterprise starts at 20 seats. Contact sales for current pricing and usage terms.",
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
    title: "Why Paw Models",
    category: "Engineering",
    excerpt: "Why you pick a Paw model instead of managing AI vendors yourself.",
    body: [
      "Most AI products that let you \"bring your own model\" push a decision onto you that you're rarely equipped to make well: which provider is actually best for this specific task, today, at this price point.",
      "PawOS gives you named Paw models instead — Flash, Swift, Core, Vision, Voice and Memory — each tuned for a kind of work and matched to your tier, and they keep improving without you having to re-choose anything.",
      "It's a bet that most people want good results more than they want to manage a model marketplace themselves. Infrastructure and integration connectors work the opposite way, deliberately: you choose your own real hosting provider, ticket tracker, and source control system, because those are decisions with real, provider-specific consequences that shouldn't be abstracted away.",
    ],
  },
  {
    slug: "ai-safety",
    title: "AI Safety",
    category: "Safety",
    excerpt: "What we mean when we say PawOS is honest by design.",
    body: [
      "PawOS is designed to report task progress and errors, but AI-generated plans and changes can still be incomplete or wrong. Review the output before relying on it.",
      "Approval controls vary by action and product. They reduce some risks; they do not replace review or make a workflow risk-free.",
      "Feature availability, billing and organization controls depend on the plan and configuration. Check the current product screens and documentation for the terms that apply to your account.",
    ],
  },
  {
    slug: "engineering-workflows",
    title: "Engineering Workflows",
    category: "Engineering",
    excerpt: "How PawOS fits into a real development process.",
    body: [
      "PawOS is intended to work alongside an engineering workflow. Desktop and CLI can work with supported local projects; Web can make changes in connected GitHub repositories.",
      "The commands, checks and provider actions available vary by product, repository and configuration. Review the output from a run and confirm the checks your project requires.",
      "Ticket workflows can stop for approval or when a required capability is unavailable. Review any proposed pull request and ticket update using your team's normal process.",
    ],
  },
  {
    slug: "release-announcement-pawos-web",
    title: "Release Announcement: pawos.revantaai.com is live",
    category: "Announcements",
    excerpt: "The PawOS documentation and marketing site is now public.",
    body: [
      "This site — pawos.revantaai.com — is now live: a full features catalog, a documentation system covering every runtime, a knowledge base, this blog, pricing, and (once builds are published) downloads.",
      "The desktop application remains the product; this site exists to explain it honestly, including what it can't yet do. Expect this to keep growing alongside the app itself — new runtime capabilities, new deployment providers, and new documentation as features ship.",
    ],
  },
  {
    slug: "roadmap-update-deployment-providers",
    title: "Product Update: Deployment support",
    category: "Product",
    excerpt: "Deployment options depend on local tools and provider configuration.",
    body: [
      "PawOS deployment workflows depend on the configured runtime, provider connector, installed tools and credentials. Support is not universal across hosting providers.",
      "Check the current deployment documentation for supported configurations and limitations before using a workflow against production.",
    ],
  },
  {
    slug: "product-update-autonomous-engineering-billing",
    title: "Product Update: Autonomous Work billing",
    category: "Product",
    excerpt: "Where to check the current billing terms for Autonomous Work.",
    body: [
      "Autonomous Work uses a prepaid balance separate from Paw Compute. Top-up options and usage rates can depend on account or organization terms; check the billing screen for the current amounts before starting paid work.",
      "Enterprise usage follows separate pass-through provider terms rather than standard Ticket Balance pricing. Contact sales if you need the terms for an organization plan.",
      "The app shows billing and usage history for the account. See the current billing documentation for balance and completion rules.",
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
