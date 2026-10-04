import type { AccountContext } from "../account/accountContext";
import { isIntegrationEntitled } from "../account/integrations";

/**
 * PawOS Web's server-side GitHub client — for frontend changes from the web (paid plans).
 *
 * The token is the account's existing GitHub connector credential (the same one the desktop app
 * uses), read on the server through read_connectivity_credential() under the user's own session —
 * so row-level security and Vault decide whose token it is, never the request. The token never
 * leaves the server: it is not returned, logged, or put in a URL.
 *
 * Writes are deliberately narrow: commit and fast-forward a branch (never a force push), create a
 * branch, open a pull request. Nothing here can rewrite history, merge, or delete.
 */

const GITHUB_API = "https://api.github.com";

/** The local browser tests (e2e/) point the dev server at a stub; production always uses GitHub. */
function apiBase(): string {
  const override = process.env.WEB_GITHUB_API_BASE_URL;
  return override && process.env.NODE_ENV !== "production" ? override.replace(/\/+$/, "") : GITHUB_API;
}

export type GitHubFailure = "not_connected" | "needs_reauth" | "no_access" | "not_found" | "conflict" | "unavailable";

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubFailure,
    message: string
  ) {
    super(message);
  }
}

export interface GitHubRepository {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  canPush: boolean;
}

export interface GitHubTreeEntry {
  path: string;
  size: number;
}

export type PushResult = { status: "pushed"; sha: string } | { status: "moved" } | { status: "protected" };

/** One signal about a pushed commit: a deployment, a commit status or a check run. */
export interface CommitSignal {
  kind: "deployment" | "status" | "check";
  name: string;
  state: "pending" | "success" | "failure";
  /** A preview / deployment URL, when the signal carries one. */
  url: string | null;
  /** What it said, for a failure: title, summary and annotations from the check. */
  detail: string;
  checkRunId: number | null;
}

export interface GitHubPullRequest {
  number: number;
  url: string;
  branch: string;
}

/** Whether the account has a usable GitHub connection — the connection row only; no token is read. */
export async function githubConnectionState(account: AccountContext): Promise<"connected" | "needsReauth" | "notConnected"> {
  if (!isIntegrationEntitled(account, "github")) return "notConnected";
  const { data, error } = await account.supabase
    .from("connectivity_connections")
    .select("status")
    .eq("user_id", account.user.id)
    .eq("connector_id", "github")
    .is("organization_id", null)
    .maybeSingle();
  if (error || !data) return "notConnected";
  const status = (data as { status?: string }).status;
  return status === "connected" ? "connected" : status === "needsReauth" || status === "error" ? "needsReauth" : "notConnected";
}

/** The account's GitHub client, or a GitHubError saying why there is none. */
export async function githubClientFor(account: AccountContext): Promise<GitHubClient> {
  const state = await githubConnectionState(account);
  if (state === "notConnected") throw new GitHubError("not_connected", "Connect GitHub to make changes from PawOS Web.");
  if (state === "needsReauth") throw new GitHubError("needs_reauth", "Reconnect GitHub to make changes from PawOS Web.");
  const { data, error } = await account.supabase.rpc("read_connectivity_credential", { p_connector_id: "github", p_organization_id: null });
  const row = (Array.isArray(data) ? data[0] : data) as { secret?: string | null; expires_at?: string | null } | null;
  if (error || !row?.secret) throw new GitHubError("not_connected", "Connect GitHub to make changes from PawOS Web.");
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw new GitHubError("needs_reauth", "Reconnect GitHub to make changes from PawOS Web.");
  return new GitHubClient(row.secret);
}

const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

export function isRepositoryName(value: unknown): value is string {
  return typeof value === "string" && REPO_NAME.test(value) && !value.split("/").some((part) => part === "." || part === "..");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export class GitHubClient {
  // A private field: never serialised, never logged.
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown, allow: number[] = []): Promise<{ status: number; data: T | null }> {
    let response: Response;
    try {
      response = await fetch(`${apiBase()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.#token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "PawOS-Web",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitHubError("unavailable", "GitHub couldn't be reached. Please try again.");
    }
    const data = (await response.json().catch(() => null)) as T | null;
    if (response.ok || allow.includes(response.status)) return { status: response.status, data };
    if (response.status === 401) throw new GitHubError("needs_reauth", "GitHub didn't accept the connection. Reconnect GitHub and try again.");
    if (response.status === 403) throw new GitHubError("no_access", "Your GitHub connection doesn't have access to do that.");
    if (response.status === 404) throw new GitHubError("not_found", "That repository or file wasn't found on GitHub.");
    if (response.status === 409 || response.status === 422) throw new GitHubError("conflict", "GitHub refused the change.");
    throw new GitHubError("unavailable", "GitHub couldn't complete that. Please try again.");
  }

  /** Repositories the account can push to, most recently pushed first. */
  async listRepositories(): Promise<GitHubRepository[]> {
    const { data } = await this.request<RepoJson[]>("GET", "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member");
    return (data ?? []).map(toRepository).filter((repo) => repo.canPush);
  }

  async getRepository(fullName: string): Promise<GitHubRepository> {
    const { data } = await this.request<RepoJson>("GET", `/repos/${fullName}`);
    if (!data) throw new GitHubError("not_found", "That repository wasn't found on GitHub.");
    return toRepository(data);
  }

  /** The commit a branch points at, or null when the branch doesn't exist. */
  async branchSha(fullName: string, branch: string): Promise<string | null> {
    const { status, data } = await this.request<{ object?: { sha?: string } }>("GET", `/repos/${fullName}/git/ref/heads/${encodePath(branch)}`, undefined, [404]);
    return status === 404 ? null : (data?.object?.sha ?? null);
  }

  /** Every file in the repository at a commit (GitHub may truncate very large repositories). */
  async tree(fullName: string, commitSha: string): Promise<GitHubTreeEntry[]> {
    const { data } = await this.request<{ tree?: { path: string; type: string; size?: number }[] }>("GET", `/repos/${fullName}/git/trees/${commitSha}?recursive=1`);
    return (data?.tree ?? []).filter((entry) => entry.type === "blob").map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
  }

  /** A text file's content at a ref, or null when it doesn't exist. */
  async readFile(fullName: string, path: string, ref: string): Promise<string | null> {
    const { status, data } = await this.request<{ content?: string; encoding?: string }>("GET", `/repos/${fullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, [404]);
    if (status === 404 || !data?.content || data.encoding !== "base64") return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  }

  /**
   * Commits `files` onto a NEW branch made from `baseSha`. If the branch already exists (a retried
   * request), nothing is committed again and the existing branch is used as it is.
   */
  async commitToNewBranch(fullName: string, branch: string, baseSha: string, message: string, files: { path: string; content: string }[]): Promise<{ created: boolean }> {
    if (await this.branchSha(fullName, branch)) return { created: false };
    const base = await this.request<{ tree?: { sha?: string } }>("GET", `/repos/${fullName}/git/commits/${baseSha}`);
    const tree = await this.request<{ sha?: string }>("POST", `/repos/${fullName}/git/trees`, {
      base_tree: base.data?.tree?.sha,
      tree: files.map((file) => ({ path: file.path, mode: "100644", type: "blob", content: file.content })),
    });
    const commit = await this.request<{ sha?: string }>("POST", `/repos/${fullName}/git/commits`, { message, tree: tree.data?.sha, parents: [baseSha] });
    const ref = await this.request("POST", `/repos/${fullName}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.data?.sha }, [422]);
    // 422: the branch appeared in the meantime (a parallel retry) — use it.
    return { created: ref.status !== 422 };
  }

  /**
   * Commits `files` on top of `baseSha` and moves `branch` to it — a fast-forward only. "moved":
   * the branch moved meanwhile (try again on its new head). "protected": GitHub refused the update
   * (branch protection or rules), so the caller must use a branch and a pull request instead.
   */
  async pushToBranch(fullName: string, branch: string, baseSha: string, message: string, files: { path: string; content: string }[]): Promise<PushResult> {
    const base = await this.request<{ tree?: { sha?: string } }>("GET", `/repos/${fullName}/git/commits/${baseSha}`);
    const tree = await this.request<{ sha?: string }>("POST", `/repos/${fullName}/git/trees`, {
      base_tree: base.data?.tree?.sha,
      tree: files.map((file) => ({ path: file.path, mode: "100644", type: "blob", content: file.content })),
    });
    const commit = await this.request<{ sha?: string }>("POST", `/repos/${fullName}/git/commits`, { message, tree: tree.data?.sha, parents: [baseSha] });
    const sha = commit.data?.sha;
    if (!sha) throw new GitHubError("unavailable", "GitHub didn't create the commit.");
    const update = await this.request<{ message?: string }>("PATCH", `/repos/${fullName}/git/refs/heads/${encodePath(branch)}`, { sha, force: false }, [403, 409, 422]);
    if (update.status < 300) return { status: "pushed", sha };
    const reason = (update.data?.message ?? "").toLowerCase();
    if (update.status === 422 && reason.includes("fast forward")) return { status: "moved" };
    return { status: "protected" };
  }

  /** Everything GitHub knows about how a commit is doing: deployments, statuses, check runs. */
  async commitSignals(fullName: string, sha: string): Promise<CommitSignal[]> {
    const signals: CommitSignal[] = [];
    const [deployments, combined, checks] = await Promise.all([
      this.request<{ id: number; environment?: string }[]>("GET", `/repos/${fullName}/deployments?sha=${sha}&per_page=10`, undefined, [404]),
      this.request<{ statuses?: { state: string; context: string; target_url?: string | null; description?: string | null }[] }>("GET", `/repos/${fullName}/commits/${sha}/status`, undefined, [404]),
      this.request<{ check_runs?: { id: number; name: string; status: string; conclusion: string | null; details_url?: string | null; output?: { title?: string | null; summary?: string | null; text?: string | null } }[] }>(
        "GET",
        `/repos/${fullName}/commits/${sha}/check-runs?per_page=50`,
        undefined,
        [404]
      ),
    ]);
    for (const deployment of deployments.data ?? []) {
      const statuses = await this.request<{ state: string; environment_url?: string | null; target_url?: string | null; description?: string | null }[]>(
        "GET",
        `/repos/${fullName}/deployments/${deployment.id}/statuses?per_page=1`,
        undefined,
        [404]
      );
      const latest = statuses.data?.[0];
      const state = latest?.state;
      signals.push({
        kind: "deployment",
        name: deployment.environment ?? "deployment",
        state: state === "success" ? "success" : state === "failure" || state === "error" ? "failure" : "pending",
        url: httpsOrNull(latest?.environment_url) ?? httpsOrNull(latest?.target_url),
        detail: latest?.description ?? "",
        checkRunId: null,
      });
    }
    for (const status of combined.data?.statuses ?? []) {
      signals.push({
        kind: "status",
        name: status.context,
        state: status.state === "success" ? "success" : status.state === "failure" || status.state === "error" ? "failure" : "pending",
        url: httpsOrNull(status.target_url),
        detail: status.description ?? "",
        checkRunId: null,
      });
    }
    for (const run of checks.data?.check_runs ?? []) {
      const failed = run.conclusion === "failure" || run.conclusion === "timed_out" || run.conclusion === "action_required" || run.conclusion === "startup_failure";
      signals.push({
        kind: "check",
        name: run.name,
        state: run.status !== "completed" ? "pending" : failed ? "failure" : "success",
        url: null,
        detail: [run.output?.title, run.output?.summary, run.output?.text].filter(Boolean).join("\n").slice(0, 6000),
        checkRunId: run.id,
      });
    }
    return signals;
  }

  /** A failed check's annotations (file, line, message) — what the fix needs to know. */
  async checkAnnotations(fullName: string, checkRunId: number): Promise<string> {
    const { data } = await this.request<{ path: string; start_line: number; message: string; annotation_level: string }[]>("GET", `/repos/${fullName}/check-runs/${checkRunId}/annotations?per_page=30`, undefined, [404]);
    return (data ?? []).map((note) => `${note.path}:${note.start_line} ${note.annotation_level}: ${note.message}`).join("\n").slice(0, 6000);
  }

  /** The pull request from `branch` into `base`, opening it if there isn't one. */
  async ensurePullRequest(fullName: string, branch: string, base: string, title: string, body: string): Promise<GitHubPullRequest> {
    const owner = fullName.split("/")[0];
    const existing = await this.request<PullJson[]>("GET", `/repos/${fullName}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    const found = existing.data?.[0];
    if (found) return { number: found.number, url: found.html_url, branch };
    const created = await this.request<PullJson>("POST", `/repos/${fullName}/pulls`, { title, head: branch, base, body, maintainer_can_modify: true });
    if (!created.data) throw new GitHubError("unavailable", "GitHub didn't open the pull request.");
    return { number: created.data.number, url: created.data.html_url, branch };
  }
}

function httpsOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type RepoJson = { full_name: string; default_branch: string; private: boolean; permissions?: { push?: boolean; admin?: boolean } };
type PullJson = { number: number; html_url: string };

function toRepository(repo: RepoJson): GitHubRepository {
  return { fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private, canPush: repo.permissions?.push === true || repo.permissions?.admin === true };
}
