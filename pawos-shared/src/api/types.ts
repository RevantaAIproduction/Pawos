/**
 * The shapes PawOS Web's existing API returns — mirrors of the server's own types, kept in sync by
 * hand because pawos-web is a separate deployment with no shared build:
 *   capabilities  pawos-web/src/app/api/web/capabilities/route.ts
 *   readiness     pawos-web/src/lib/webCode/repository.ts (CodeChangeReadiness)
 *   change        pawos-web/src/lib/webCode/codeChange.ts (CodeChangeView)
 *   send          pawos-web/src/lib/webChat/webChat.ts (SendResult)
 */
export type CapabilityStatus = "available" | "locked" | "desktopOnly" | "future";

export interface Capabilities {
  plan: { tier: string; label: string };
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
