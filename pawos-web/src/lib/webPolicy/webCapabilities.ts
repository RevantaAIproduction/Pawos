import type { AccountContext } from "../account/accountContext";
import { TIER_LABELS, type AccountTier } from "../account/entitlements";

/**
 * The PawOS Web capability policy — what an account may do on PawOS Web, decided on the server.
 *
 * This sits on top of the existing account entitlement, not beside it: the only input is the
 * account's server-resolved tier (accountContext.ts — subscription, organization membership or
 * Build grant). There is no web plan, no web balance and no web wallet. A capability being
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
  | "web.remoteWork"
  | "web.autonomousWork"
  | "web.browserWork";

export type WebCapabilityAvailability = "available" | "desktopOnly" | "future";

/** Numbers the web policy enforces. Change them here, nowhere else. */
export const WEB_POLICY = {
  /** Paw Go: total Web chat messages an account may ever send. Other tiers have no message cap. */
  goLifetimeWebMessages: 4,
  maxMessageChars: 4000,
  /** Largest text file that may be attached to a message, in UTF-8 bytes. */
  maxAttachmentBytes: 60_000,
  maxAttachmentNameChars: 120,
} as const;

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
  { id: "web.fileUpload", label: "File attachments", description: "Attach a text or code file to a message.", availability: "available", tiers: PAID_TIERS },
  { id: "web.integrationContext", label: "Integration context", description: "Use connected services as context for a conversation.", availability: "desktopOnly", tiers: [] },
  { id: "web.mcpRead", label: "MCP read access", description: "Read from connected services through their MCP servers.", availability: "desktopOnly", tiers: [] },
  { id: "web.continueInDesktop", label: "Continue in PawOS Desktop", description: "Hand a web conversation over to the desktop app.", availability: "future", tiers: [] },
  { id: "web.remoteWork", label: "Remote work sessions", description: "Run work in an isolated remote workspace.", availability: "future", tiers: [] },
  { id: "web.autonomousWork", label: "Autonomous Work", description: "Resolve tickets end to end from the web.", availability: "future", tiers: [] },
  { id: "web.browserWork", label: "Browser work", description: "Drive a browser from the web.", availability: "future", tiers: [] },
];

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

/** The Web chat message cap for a tier: Paw Go is capped; every other tier runs on its usage allowance. */
export function webMessageLimitFor(account: Pick<AccountContext, "tier">): number | null {
  return account.tier === "go" ? WEB_POLICY.goLifetimeWebMessages : null;
}

/**
 * Where an activity happened. Derived from the usage category the server recorded when it reserved
 * the call — display and analytics only, never an authorization input.
 */
export type ExecutionSurface = "web" | "desktop";

export function surfaceOfUsageCategory(category: string | null | undefined): ExecutionSurface {
  return typeof category === "string" && category.startsWith("web-") ? "web" : "desktop";
}
