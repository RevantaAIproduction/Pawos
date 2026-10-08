/**
 * The shapes PawOS Web's existing API returns — mirrors of the server's own types, kept in sync by
 * hand because pawos-web is a separate deployment with no shared build:
 *   capabilities  pawos-web/src/app/api/web/capabilities/route.ts
 *   readiness     pawos-web/src/lib/webCode/repository.ts (CodeChangeReadiness)
 *   change        pawos-web/src/lib/webCode/codeChange.ts (CodeChangeView)
 *   send          pawos-web/src/lib/webChat/webChat.ts (SendResult)
 *   overview      pawos-web/src/app/api/dashboard/overview/route.ts, lib/account/usage.ts
 *   integrations  pawos-web/src/lib/account/integrations.ts (IntegrationState)
 */
export type CapabilityStatus = "available" | "locked" | "desktopOnly" | "future";

export interface Capabilities {
  plan: { tier: string; label: string };
  /** The account holder's name, when they have one on record. Never an email address. */
  user?: { name: string | null } | null;
  capabilities: { id: string; label: string; status: CapabilityStatus; availableOn: string | null }[];
}

export type RepositoryReadiness =
  | { state: "locked"; availableOn: string | null }
  | { state: "githubNotConnected" }
  | { state: "githubNeedsReauth" }
  | { state: "noRepository" }
  | { state: "ready"; repository: { fullName: string; defaultBranch: string }; scope: "small" | "full" };

export type StepStatus = "pending" | "active" | "done" | "failed" | "skipped";
export interface CodeChangeStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export type CodeChangeState = "running" | "pushed" | "fixing" | "done" | "failed";
export type ChecksState = "pending" | "success" | "failure" | "none";

export interface CodeChange {
  requestId: string;
  repository: string;
  state: CodeChangeState;
  steps: CodeChangeStep[];
  branch: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  pullRequestUrl: string | null;
  files: string[];
  summary: string | null;
  previewUrl: string | null;
  checksState: ChecksState;
  fixAttempts: number;
  error: string | null;
}

export interface SendResult {
  chatId: string;
  reply: string;
  recovered: boolean;
  requiresDesktop: boolean;
  change?: CodeChange | null;
}

/** One of the account's usage allowances, as PawOS reports it (plan, extra usage, purchased credits). */
export interface UsageBucket {
  id: string;
  label: string;
  type: string;
  pcTotal: number;
  pcUsed: number;
  percentUsed: number;
  status: string;
  resetsAt: string | null;
  expiresAt: string | null;
}

export interface UsageOverview {
  planLabel: string | null;
  buckets: UsageBucket[];
  weeklyPacing: { percentUsed: number; reached: boolean; resetsAt: string | null } | null;
  limitReached: boolean;
  limitResetsAt: string | null;
}

/** GET /api/dashboard/overview — the account's plan, usage and connection summary, all resolved on the server. */
export interface AccountOverview {
  plan: { tier: string; label: string; proMaxVariant?: string | null; expiresAt?: string | null };
  usage: UsageOverview | null;
  integrations: { connected: string[]; available: number; total: number } | null;
}

export type IntegrationConnection = "connected" | "needsReauth" | "error" | "notConnected";

/** One of the account's PawOS conversations (a chat or a code task), as GET /api/web-chat/chats lists it. */
export interface RecentChat {
  id: string;
  title: string;
  updatedAt: string;
  /** Where it started: PawOS Desktop, or PawOS Web (which the CLI uses). */
  surface: "web" | "desktop";
}

/** A text file sent with a message (POST /api/web-chat/messages `attachment`). PawOS checks the plan, the size and the type. */
export interface ChatAttachment {
  name: string;
  content: string;
}

/** One message of an earlier conversation, as GET /api/web-chat/chats?chat=<id> returns it. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** One connector PawOS supports, with this account's entitlement and connection state. No credential is ever part of it. */
export interface Integration {
  id: string;
  name: string;
  description: string;
  group: string;
  entitled: boolean;
  /** When not entitled: the lowest plan that includes it. */
  availableOn: string | null;
  connection: IntegrationConnection;
  accountLabel: string | null;
  connectedAt: string | null;
  mcp: string | null;
}

/**
 * How PawOS says a connector is connected (POST /api/dashboard/integrations/<id>): through the
 * Integrations page in a signed-in browser, or from the PawOS desktop app.
 */
export type ConnectStart = { method: "redirect" } | { method: "desktop"; message: string };
