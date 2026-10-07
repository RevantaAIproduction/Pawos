import type { CodeChange, CodeChangeStep } from "../api/types";
import type { AuthStatus } from "../../../pawos-shared/src/auth/session";
import { describeRepository, type RepoView } from "../../../pawos-shared/src/model/repository";
import { describeChecks, safeHttpsUrl } from "../../../pawos-shared/src/model/result";

export { describeChecks, describeRepository, safeHttpsUrl, type RepoView };

/** Everything the sidebar shows. Plain data: no token, no credential, nothing secret is ever in it. */
export interface SidebarState {
  auth: AuthStatus;
  /** Why the extension can't be used yet (settings missing), or null. */
  configProblem: string | null;
  /** Why the user was signed out, when it wasn't their choice. */
  notice: string | null;
  /** The last thing that went wrong loading the account or repository. */
  error: string | null;
  loading: boolean;
  email: string | null;
  plan: string | null;
  repo: RepoView;
  task: TaskView;
}

export type TaskPhase = "idle" | "running" | "complete" | "noChange" | "failed" | "timeout";

export interface TaskView {
  phase: TaskPhase;
  requestId: string | null;
  repository: string | null;
  steps: CodeChangeStep[];
  message: string | null;
  summary: string | null;
  files: string[];
  checks: string | null;
  commitUrl: string | null;
  pullRequestUrl: string | null;
}

export const LIMITATION_NOTE = "PawOS works on the connected GitHub repository. Review the resulting commit or pull request.";

export const IDLE_TASK: TaskView = {
  phase: "idle",
  requestId: null,
  repository: null,
  steps: [],
  message: null,
  summary: null,
  files: [],
  checks: null,
  commitUrl: null,
  pullRequestUrl: null,
};

export function changeToTask(phase: TaskPhase, requestId: string, change: CodeChange | null, message: string | null, stillWatching: boolean): TaskView {
  return {
    phase,
    requestId,
    repository: change?.repository ?? null,
    steps: change?.steps ?? [],
    message,
    summary: change?.summary ?? null,
    files: change?.files ?? [],
    checks: change?.commitSha ? describeChecks(change, stillWatching) : null,
    commitUrl: safeHttpsUrl(change?.commitUrl),
    pullRequestUrl: safeHttpsUrl(change?.pullRequestUrl),
  };
}
