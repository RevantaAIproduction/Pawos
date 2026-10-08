import type { AccountContext } from "../account/accountContext";
import { TIER_LABELS, type AccountTier } from "../account/entitlements";

/**
 * The PawOS Web capability policy — what an account may do on PawOS Web, decided on the server.
 *
 * This sits on top of the existing account entitlement, not beside it: the only input is the
 * account's server-resolved tier (accountContext.ts — subscription, organization membership or
 * Build grant). Web has no plan, allowance or wallet of its own. A capability being
 * "available" says the account may use it; what a use costs is still charged to the plan's
 * existing usage allowance through reserve_usage / settle_usage (see webChat.ts).
 *
 * Every Web API route enforces its capability with requireWebCapability(). React components only
 * display what resolveWebCapabilities() returned; nothing a browser sends can change the answer.
 *
 * `availability` is about PawOS itself, independent of plan:
 *  - "available": built and working on the web today.
 *  - "desktopOnly": exists in PawOS, but only the desktop app can do it today.
 *  - "future": not built anywhere on the web. Listed so the model has a place for it; no API
 *    route exists for it and no UI offers it as working.
 */

export type WebCapabilityId =
  | "web.chat"
  | "web.codeReview"
  | "web.fileUpload"
  | "web.integrationContext"
  | "web.mcpRead"
  | "web.continueInDesktop"
  | "web.codeChanges"
  | "web.remoteWork"
  | "web.autonomousWork"
  | "web.browserWork";

export type WebCapabilityAvailability = "available" | "desktopOnly" | "future";

/** Numbers the web policy enforces. Change them here, nowhere else. */
export const WEB_POLICY = {
  /**
   * Paw Go: total Web chat messages an account may ever send. Other tiers have no message cap.
   * The database enforces it (web_chat_begin_request / web_chat_append_exchange take it as the limit).
   */
  goLifetimeWebMessages: 4,
  maxMessageChars: 4000,
  /** Largest text file that may be attached to a message, in UTF-8 bytes. */
  maxAttachmentBytes: 60_000,
  maxAttachmentNameChars: 120,
  /** Largest photo that may be uploaded, in bytes — matches the 'web-chat-uploads' bucket limit. */
  maxImageBytes: 5 * 1024 * 1024,
  /** Photos one account may upload in 24 hours. */
  maxImageUploadsPerDay: 50,
  /** Input-size allowance added to a usage reservation for one attached photo. */
  imageReservationInputTokens: 2_000,
  /** How long a send's claim holds before an abandoned attempt may be retried, in seconds. */
  requestLeaseSeconds: 150,
  /** Most conversation text handed to PawOS Desktop by "Continue in PawOS Desktop". */
  handoffTranscriptChars: 12_000,
  /** Paw Go: the longest prompt PawOS Web accepts — small requests only. */
  goMaxPromptLines: 2,
  goMaxPromptChars: 200,
  /**
   * The admin-granted access tier: Web messages in a rolling week — WITHIN its included allowance,
   * not on top of it: Web messages also stop once the tier's Paw Compute limits below are reached
   * (PawOS Desktop's reported usage plus Web's own).
   */
  adminTierWeeklyWebMessages: 12,
  /** That tier's included Paw Compute — the same program terms PawOS Desktop enforces. */
  adminTierWeeklyPc: 1_500,
  adminTierWindowPc: 500,
  adminTierWindowHours: 5,
  /**
   * Code changes from the web, pushed to the selected GitHub repository. Paid plans make full
   * changes (frontend and backend) on their usage allowance; Paw Go makes small frontend changes
   * (text, headings, titles, buttons) within its four messages.
   */
  codeChange: {
    small: { maxFilesRead: 3, maxFilesChanged: 2, maxChangedLines: 40, maxFileBytes: 60_000, maxContextBytes: 90_000, autoFixAttempts: 1, investigationRounds: 0 },
    full: { maxFilesRead: 12, maxFilesChanged: 10, maxChangedLines: 2_000, maxFileBytes: 100_000, maxContextBytes: 300_000, autoFixAttempts: 2, investigationRounds: 2 },
    // investigationRounds: how many times a change may go back for more files (the ones the code it
    // has read refers to) before it plans. Every file still counts against maxFilesRead and
    // maxContextBytes, and every round is a model call on the plan's allowance.
    /** Repository paths listed to the model when it picks files. */
    maxTreeEntries: 2_000,
    /** A change takes several model and GitHub calls: its claim holds longer than a chat message's. */
    requestLeaseSeconds: 300,
    /** How long to wait for a preview deployment or checks to report on a pushed commit. */
    previewWaitSeconds: 300,
  },
} as const;

/** Photo types PawOS Web accepts (the model reads all of them). */
export const WEB_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"] as const;
export type WebImageMimeType = (typeof WEB_IMAGE_MIME_TYPES)[number];

const ALL_TIERS: readonly AccountTier[] = ["go", "pro", "proMax", "team", "enterprise", "build"];
const PAID_TIERS: readonly AccountTier[] = ["pro", "proMax", "team", "enterprise", "build"];

interface WebCapabilityRule {
  id: WebCapabilityId;
  label: string;
  description: string;
  availability: WebCapabilityAvailability;
  /** Tiers that hold the capability. Only meaningful when availability is "available". */
  tiers: readonly AccountTier[];
}

export const WEB_CAPABILITY_RULES: readonly WebCapabilityRule[] = [
  { id: "web.chat", label: "Chat", description: "Talk with Paw: explain, plan, and answer questions.", availability: "available", tiers: ALL_TIERS },
  { id: "web.codeReview", label: "Code review", description: "Review code pasted into the conversation.", availability: "available", tiers: ALL_TIERS },
  { id: "web.fileUpload", label: "File attachments", description: "Attach a photo, or a text or code file, to a message.", availability: "available", tiers: PAID_TIERS },
  { id: "web.integrationContext", label: "Integration context", description: "Use connected services as context for a conversation.", availability: "desktopOnly", tiers: [] },
  { id: "web.mcpRead", label: "MCP read access", description: "Read from connected services through their MCP servers.", availability: "desktopOnly", tiers: [] },
  { id: "web.continueInDesktop", label: "Continue in PawOS Desktop", description: "Take a web conversation to the desktop app to do the work there.", availability: "available", tiers: ALL_TIERS },
  {
    id: "web.codeChanges",
    label: "Code changes",
    description: "Change code in a connected GitHub repository and push it. Paw Go: small frontend changes; paid plans: frontend and backend.",
    availability: "available",
    tiers: ALL_TIERS,
  },
  { id: "web.remoteWork", label: "Remote work sessions", description: "Run work in an isolated remote workspace.", availability: "future", tiers: [] },
  { id: "web.autonomousWork", label: "Autonomous Work", description: "Resolve tickets end to end from the web.", availability: "future", tiers: [] },
  { id: "web.browserWork", label: "Browser work", description: "Drive a browser from the web.", availability: "future", tiers: [] },
];

/**
 * What only PawOS Desktop does — the other side of the boundary. PawOS Web never claims to do any
 * of these; a request that needs one is answered with "this needs PawOS Desktop" and a
 * Continue in PawOS Desktop action. The Web chat's instructions to the model are built from this list.
 */
export const DESKTOP_ONLY_CAPABILITIES = [
  { id: "desktop.filesystem", label: "read or change files on your computer" },
  { id: "desktop.terminal", label: "run commands in a terminal" },
  { id: "desktop.browserAutomation", label: "drive a browser on your computer" },
  { id: "desktop.codingRuntime", label: "open, build or run your projects" },
  { id: "desktop.tests", label: "run your tests" },
  { id: "desktop.devEnvironment", label: "install software or change your development environment" },
  { id: "desktop.git", label: "work with Git in a local checkout (other branches, history, merges, local-only repositories)" },
  { id: "desktop.autonomousWork", label: "resolve tickets end to end (Autonomous Work)" },
  { id: "desktop.connectedServices", label: "read from or act in your connected services (Jira, Slack, …) beyond PawOS Web's code changes on GitHub" },
  { id: "desktop.companionRuntime", label: "run the desktop Companion" },
  { id: "desktop.offline", label: "work offline" },
  { id: "desktop.os", label: "use operating-system features (notifications, windows, devices)" },
] as const;

export type WebCapabilityStatus = "available" | "locked" | "desktopOnly" | "future";

export interface ResolvedWebCapability {
  id: WebCapabilityId;
  label: string;
  description: string;
  status: WebCapabilityStatus;
  /** When locked: the lowest plan that includes it, e.g. "Paw Pro". */
  availableOn: string | null;
}

const UPGRADE_ORDER: readonly AccountTier[] = ["go", "pro", "proMax", "team", "enterprise"];

function rule(id: WebCapabilityId): WebCapabilityRule {
  const found = WEB_CAPABILITY_RULES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown web capability '${id}'.`);
  return found;
}

export function webCapabilityStatus(account: Pick<AccountContext, "tier">, id: WebCapabilityId): WebCapabilityStatus {
  const r = rule(id);
  if (r.availability !== "available") return r.availability;
  return r.tiers.includes(account.tier) ? "available" : "locked";
}

export function canUseWebCapability(account: Pick<AccountContext, "tier">, id: WebCapabilityId): boolean {
  return webCapabilityStatus(account, id) === "available";
}

/** Every web capability with this account's status — for display. */
export function resolveWebCapabilities(account: Pick<AccountContext, "tier">): ResolvedWebCapability[] {
  return WEB_CAPABILITY_RULES.map((r) => {
    const status = webCapabilityStatus(account, r.id);
    const lowest = status === "locked" ? UPGRADE_ORDER.find((tier) => r.tiers.includes(tier)) : undefined;
    return { id: r.id, label: r.label, description: r.description, status, availableOn: lowest ? TIER_LABELS[lowest] : null };
  });
}

export class WebCapabilityError extends Error {
  readonly status = 403;
  constructor(
    readonly capability: WebCapabilityId,
    readonly capabilityStatus: Exclude<WebCapabilityStatus, "available">,
    message: string
  ) {
    super(message);
  }
}

/** Throws unless the account may use the capability right now. Call this in every Web API route. */
export function requireWebCapability(account: Pick<AccountContext, "tier">, id: WebCapabilityId): void {
  const status = webCapabilityStatus(account, id);
  if (status === "available") return;
  const r = rule(id);
  const message =
    status === "locked"
      ? `${r.label} isn't included in your plan.`
      : status === "desktopOnly"
        ? `${r.label} needs the PawOS desktop app.`
        : `${r.label} isn't available on PawOS Web yet.`;
  throw new WebCapabilityError(id, status, message);
}

/**
 * The Web message cap for a tier, or null when the plan's usage allowance alone governs:
 * Paw Go — 4 messages ever; the admin-granted access tier — 12 in a rolling week; others — none.
 */
export function webMessageLimitFor(account: Pick<AccountContext, "tier">): number | null {
  if (account.tier === "go") return WEB_POLICY.goLifetimeWebMessages;
  if (account.tier === "build") return WEB_POLICY.adminTierWeeklyWebMessages;
  return null;
}

/** The window the cap counts over, in days, or null for a lifetime cap. */
export function webMessageWindowDaysFor(account: Pick<AccountContext, "tier">): number | null {
  return account.tier === "build" ? 7 : null;
}

/**
 * Where a Web message's usage is counted — the same place PawOS Desktop counts that plan's usage:
 *  - "planBuckets" (Pro, Pro Max, Team): every model call is reserved and settled on the account's
 *    usage buckets (reserve_usage → settle_usage), the one allowance Desktop also draws on. A Team
 *    member's bucket is their own purchased seat (Standard = Pro, Premium = Pro Max 5x) — never pooled;
 *  - "organizationPool" (Enterprise): one unit of the organization's shared monthly 'aiReasoning'
 *    pool per message (increment_organization_usage), exactly as Desktop counts a turn;
 *  - "messageCap" (Paw Go, and the admin-granted access tier): the Web message cap only — never
 *    charged to a bucket, as Desktop never charges these tiers' included allowance to one.
 */
export type WebUsageSource = "planBuckets" | "organizationPool" | "messageCap";

export function webUsageSourceFor(account: Pick<AccountContext, "tier">): WebUsageSource {
  if (account.tier === "pro" || account.tier === "proMax" || account.tier === "team") return "planBuckets";
  if (account.tier === "enterprise") return "organizationPool";
  return "messageCap";
}

/** Whether Web model calls are reserved and settled on the account's usage buckets (Pro, Pro Max, Team). */
export function isWebUsageMetered(account: Pick<AccountContext, "tier">): boolean {
  return webUsageSourceFor(account) === "planBuckets";
}

export type CodeChangeScope = "small" | "full";

/** Paw Go: small frontend changes. Every other plan: frontend and backend. */
export function codeChangeScopeFor(account: Pick<AccountContext, "tier">): CodeChangeScope {
  return account.tier === "go" ? "small" : "full";
}

/** Why a prompt is too long for the plan, or null. Paw Go accepts short prompts only. */
export function promptTooLongFor(account: Pick<AccountContext, "tier">, text: string): string | null {
  if (account.tier !== "go") return null;
  const lines = text.trim().split(/\r?\n/).length;
  if (lines <= WEB_POLICY.goMaxPromptLines && text.trim().length <= WEB_POLICY.goMaxPromptChars) return null;
  return `On Paw Go, PawOS Web accepts short prompts only — up to ${WEB_POLICY.goMaxPromptLines} lines (${WEB_POLICY.goMaxPromptChars} characters). Upgrade for longer ones.`;
}

/**
 * Where an activity happened. Derived from the usage category the server recorded when it reserved
 * the call — display and analytics only, never an authorization input.
 */
export type ExecutionSurface = "web" | "desktop";

export function surfaceOfUsageCategory(category: string | null | undefined): ExecutionSurface {
  return typeof category === "string" && category.startsWith("web-") ? "web" : "desktop";
}
