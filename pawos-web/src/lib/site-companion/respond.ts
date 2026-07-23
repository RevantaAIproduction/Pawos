import { FAQ_ITEMS } from "../faqContent";
import { FEATURES } from "../featuresContent";

export type CompanionReply = {
  text: string;
  href?: string;
  linkLabel?: string;
  suggestions: string[];
};

type NavIntent = {
  id: string;
  keywords: string[];
  text: string;
  href: string;
  linkLabel: string;
};

const DEFAULT_SUGGESTIONS = [
  "Download PawOS",
  "Show pricing",
  "How does it work?",
  "How does the companion work?",
  "Why do I need this?",
];

// Checked in order — more specific intents first so a broad keyword like
// "companion" in a later intent never shadows a more specific match above it.
const NAV_INTENTS: NavIntent[] = [
  {
    id: "autonomous-ticket",
    keywords: ["autonomous ticket", "ticket resolution", "resolve a ticket", "autonomous engineering", "autonomous task"],
    text:
      "Autonomous Ticket Resolution is PawOS's flagship capability — give Paw a real ticket from Jira, Linear, GitHub Issues, or Azure Boards, and it investigates with real evidence, plans a fix, implements and tests it, opens a pull request, and updates the ticket. It's billed only once that full cycle genuinely completes.",
    href: "/docs/autonomous-ticket-resolution",
    linkLabel: "See how it works",
  },
  {
    id: "download",
    keywords: ["download", "install pawos", "get pawos", "installer", "how do i install", "where can i download"],
    text: "PawOS runs on Windows, macOS, and Linux. Take a look at the Download page for current build availability per platform.",
    href: "/download",
    linkLabel: "Go to Download",
  },
  {
    id: "pricing",
    keywords: ["pricing", "price", "cost", "how much", "plans", "subscription", "tier", "free plan"],
    text:
      "Paw Go is free with local runtime features. Paw Pro is $20/mo, Paw Pro Max is $100/mo, and Team ($20/seat) and Enterprise ($100/seat) are seat-based for organizations. Full detail, including a feature comparison, is on the Pricing page.",
    href: "/pricing",
    linkLabel: "View pricing",
  },
  {
    id: "companion",
    keywords: [
      "companion work",
      "how does the companion",
      "companion really",
      "3d companion",
      "upload my own model",
      "upload a companion",
      "avatar",
    ],
    text:
      "Every Paw is a real, rigged 3D character — not a static picture. It has procedural motion (breathing, sway, head-look), live facial expression, and lip-sync driven by actual speech. You can customize one in Companion Studio, or upload your own GLB, GLTF, VRM, FBX, or OBJ model.",
    href: "/features/companions",
    linkLabel: "See how companions work",
  },
  {
    id: "how-it-works",
    keywords: ["how it works", "how does it work", "how does pawos work", "what happens when i ask", "what happens when you ask"],
    text:
      "It's a simple loop: you Ask — type or speak a request. Paw Plans it into concrete steps and shows you the plan. Paw Executes real actions on your machine, narrated as they happen and gated when they're risky. Then Paw Reports an honest result — what worked, what didn't, and what's genuinely finished.",
    href: "/#how-it-works",
    linkLabel: "See it on the homepage",
  },
  {
    id: "why-need",
    keywords: [
      "why do i need",
      "why need this",
      "why pawos",
      "why use pawos",
      "how this helps",
      "how does this help",
      "benefit of pawos",
      "what's the point",
    ],
    text:
      "Without a companion, you juggle a dozen open windows, re-explain context every time you switch tasks, and copy AI suggestions into your own terminal by hand. With Paw, one companion lives on your desktop, remembers your projects, and can plan, execute, and deploy on your behalf — with your confirmation at every risky step.",
    href: "/#value-prop",
    linkLabel: "Read more",
  },
  {
    id: "features",
    keywords: ["what can it do", "features", "capabilities", "what does pawos do"],
    text: "PawOS covers desktop automation, browser automation, deployments, communication, memory, and more — built from focused, independently real runtimes rather than one prompt pretending to do everything.",
    href: "/features",
    linkLabel: "See all features",
  },
  {
    id: "enterprise",
    keywords: ["enterprise", "for my team", "teams plan", "organization workspace", "for my company"],
    text:
      "PawOS scales from a single Paw on your laptop to shared Organization Workspaces with real-time presence, shared documents, task assignment, remote assistance, and org-wide governance.",
    href: "/enterprise",
    linkLabel: "Explore Enterprise",
  },
  {
    id: "security",
    keywords: ["security", "is it safe", "privacy", "is my data safe", "data safe"],
    text:
      "Destructive or production-impacting actions always pause for your explicit confirmation. Organization credentials are stored in an encrypted vault, never plain text, and actions can be gated behind an approval queue with a full audit log.",
    href: "/security",
    linkLabel: "Read the security overview",
  },
  {
    id: "docs",
    keywords: ["documentation", "docs", "getting started guide", "developer docs"],
    text: "The documentation covers getting started, every runtime, and developer guides — searchable from the Docs page.",
    href: "/docs",
    linkLabel: "Open Documentation",
  },
  {
    id: "changelog",
    keywords: ["changelog", "what's new", "whats new", "latest update", "release notes"],
    text: "The Changelog lists real, dated milestones — no invented version history.",
    href: "/changelog",
    linkLabel: "View Changelog",
  },
  {
    id: "support",
    keywords: ["support", "contact", "report a bug", "talk to a human", "feature request"],
    text: "Bugs and feature requests go straight to support@revantaai.com — the Support page has more detail.",
    href: "/support",
    linkLabel: "Go to Support",
  },
  {
    id: "blog",
    keywords: ["blog", "articles", "read more about pawos"],
    text: "The Blog has posts on product updates, engineering decisions, and the roadmap.",
    href: "/blog",
    linkLabel: "Read the Blog",
  },
  {
    id: "faq",
    keywords: ["faq", "frequently asked"],
    text: "The FAQ is searchable and covers installation, billing, privacy, security, and more.",
    href: "/faq",
    linkLabel: "Open the FAQ",
  },
  {
    id: "roadmap",
    keywords: ["roadmap", "coming soon", "future plans", "what's next"],
    text: "The Roadmap page lists what's shipped, what's next, and what's further out — honestly, without overpromising dates.",
    href: "/roadmap",
    linkLabel: "View Roadmap",
  },
];

const GREETING_KEYWORDS = ["hi", "hii", "hiii", "hello", "hey", "heya", "yo", "sup", "good morning", "good afternoon", "good evening"];
const THANKS_KEYWORDS = ["thank", "thanks", "thx", "appreciate it"];
const BYE_KEYWORDS = ["bye", "goodbye", "see you", "see ya", "later"];

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "can", "how", "what", "why", "when", "where",
  "i", "you", "it", "this", "that", "to", "of", "for", "in", "on", "with", "and", "or", "my",
  "me", "have", "has", "will", "about", "if", "so", "be", "your",
]);

function normalize(input: string): string {
  return input.toLowerCase().trim();
}

function isStandaloneGreeting(normalized: string): boolean {
  const stripped = normalized.replace(/[^a-z\s]/g, "").trim();
  return GREETING_KEYWORDS.includes(stripped) || GREETING_KEYWORDS.some((g) => stripped === g);
}

function significantWords(normalized: string): string[] {
  return normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function searchFaq(normalized: string): CompanionReply | null {
  const words = significantWords(normalized);
  if (words.length === 0) return null;

  let best: { score: number; q: string; a: string } | null = null;
  for (const item of FAQ_ITEMS) {
    const haystack = `${item.q} ${item.a} ${item.category}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { score, q: item.q, a: item.a };
    }
  }

  if (!best || best.score < 1) return null;
  return {
    text: best.a,
    href: "/faq",
    linkLabel: "See more in the FAQ",
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

function searchFeatures(normalized: string): CompanionReply | null {
  const words = significantWords(normalized);
  if (words.length === 0) return null;

  let best: { score: number; slug: string; title: string; tagline: string; summary: string } | null = null;
  for (const f of FEATURES) {
    const haystack = `${f.title} ${f.tagline} ${f.summary}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    if (score > 1 && (!best || score > best.score)) {
      best = { score, slug: f.slug, title: f.title, tagline: f.tagline, summary: f.summary };
    }
  }

  if (!best) return null;
  return {
    text: `${best.title} — ${best.summary}`,
    href: `/features/${best.slug}`,
    linkLabel: `More about ${best.title}`,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

export function getCompanionReply(input: string): CompanionReply {
  const normalized = normalize(input);

  if (normalized.length === 0) {
    return {
      text: "Hi! Welcome to PawOS. What can I do for you?",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (isStandaloneGreeting(normalized)) {
    return {
      text: "Hi! Welcome to PawOS — what can I do for you? I can point you to downloads, pricing, how it works, and how the companion itself works.",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (THANKS_KEYWORDS.some((k) => normalized.includes(k))) {
    return {
      text: "Anytime! Anything else you'd like to know about PawOS?",
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (BYE_KEYWORDS.some((k) => normalized.includes(k))) {
    return {
      text: "Take care — come back anytime you have a question about PawOS.",
      suggestions: [],
    };
  }

  for (const intent of NAV_INTENTS) {
    if (intent.keywords.some((k) => normalized.includes(k))) {
      return {
        text: intent.text,
        href: intent.href,
        linkLabel: intent.linkLabel,
        suggestions: DEFAULT_SUGGESTIONS.filter((s) => s !== intent.linkLabel),
      };
    }
  }

  const featureMatch = searchFeatures(normalized);
  if (featureMatch) return featureMatch;

  const faqMatch = searchFaq(normalized);
  if (faqMatch) return faqMatch;

  return {
    text:
      "I don't have a scripted answer for that yet — I'm a simple guide, not the full desktop companion. Try the FAQ, or reach Support at support@revantaai.com.",
    href: "/faq",
    linkLabel: "Open the FAQ",
    suggestions: DEFAULT_SUGGESTIONS,
  };
}
