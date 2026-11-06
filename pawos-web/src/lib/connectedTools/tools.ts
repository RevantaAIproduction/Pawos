import type { AccountContext } from "../account/accountContext";
import { TIER_LABELS, lowestTierWithFeature, CONNECTOR_REQUIRED_FEATURE } from "../account/entitlements";
import { isIntegrationEntitled } from "../account/integrations";
import { GitHubError, githubClientFor, isRepositoryName, type GitHubClient } from "../webCode/github";
import { isFullScopePath, normaliseRepoPath } from "../webCode/codePolicy";
import { requireWebCapability } from "../webPolicy/webCapabilities";
import { LinearError, isLinearIssueRef, linearClientFor, type LinearClient, type LinearIssue } from "./linear";

/**
 * Connected tools: a fixed list of operations PawOS runs, on its servers, against the services the
 * account has connected — for the PawOS CLI (and any other PawOS client). The client names a tool
 * and gives its arguments; it never sees a token. Every call is checked here, in this order:
 *
 *   1. the account's plan includes connected tools (`web.connectedTools`, server-resolved tier);
 *   2. the tool is on the list;
 *   3. the plan includes the provider's connector — the same rule the desktop app applies
 *      (CONNECTOR_REQUIRED_FEATURE, mirrored and parity-tested in lib/account/entitlements.ts);
 *   4. a write carries `confirmed: true`: the client asked the user and they said yes — a write is
 *      never made on an unconfirmed request, and reads never need it;
 *   5. the arguments are valid (repository names, issue keys, file paths, sizes);
 *   6. the account's own connection is there and usable (its credential, read under its own session).
 *
 * Text read from a service is the service's content — the client shows it as data, never acts on it.
 */

export type ToolAccess = "read" | "write";
export type ToolProvider = "github" | "linear";

export interface ToolDefinition {
  name: string;
  provider: ToolProvider;
  access: ToolAccess;
  summary: string;
  /** Argument names with their kind; `?` marks an optional one. */
  args: Record<string, string>;
}

export const CONNECTED_TOOLS: readonly ToolDefinition[] = [
  { name: "github.repositories", provider: "github", access: "read", summary: "Repositories your GitHub connection can see, most recently pushed first.", args: { "limit?": "number" } },
  { name: "github.repository", provider: "github", access: "read", summary: "One repository: description, default branch, visibility, open issues.", args: { repo: "owner/name" } },
  { name: "github.issues", provider: "github", access: "read", summary: "Issues in a repository (pull requests are listed separately).", args: { repo: "owner/name", "state?": "open|closed|all", "limit?": "number" } },
  { name: "github.issue", provider: "github", access: "read", summary: "One issue with its latest comments.", args: { repo: "owner/name", number: "number" } },
  { name: "github.pulls", provider: "github", access: "read", summary: "Pull requests in a repository.", args: { repo: "owner/name", "state?": "open|closed|all", "limit?": "number" } },
  { name: "github.pull", provider: "github", access: "read", summary: "One pull request with the files it changes.", args: { repo: "owner/name", number: "number" } },
  { name: "github.file", provider: "github", access: "read", summary: "A text file from a repository (never secrets, keys or lockfiles).", args: { repo: "owner/name", path: "path", "ref?": "branch, tag or commit" } },
  { name: "github.comment", provider: "github", access: "write", summary: "Comment on an issue or pull request.", args: { repo: "owner/name", number: "number", body: "text" } },
  { name: "linear.myIssues", provider: "linear", access: "read", summary: "Linear issues assigned to you, most recently updated first.", args: { "limit?": "number" } },
  { name: "linear.issue", provider: "linear", access: "read", summary: "One Linear issue by key (ENG-123).", args: { id: "issue key" } },
  { name: "linear.search", provider: "linear", access: "read", summary: "Search Linear issues.", args: { query: "text", "limit?": "number" } },
  { name: "linear.comment", provider: "linear", access: "write", summary: "Comment on a Linear issue.", args: { id: "issue key", body: "text" } },
];

export const TOOL_LIMITS = { maxList: 50, defaultList: 20, maxText: 8_000, maxComment: 4_000, maxFileBytes: 100_000, maxComments: 20, maxPullFiles: 100 } as const;

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function findTool(name: unknown): ToolDefinition | null {
  return CONNECTED_TOOLS.find((tool) => tool.name === name) ?? null;
}

/** What the account may do with each tool right now — for listing. Reads no credential. */
export function toolAvailability(account: AccountContext): { tool: ToolDefinition; entitled: boolean; availableOn: string | null }[] {
  return CONNECTED_TOOLS.map((tool) => {
    const entitled = isIntegrationEntitled(account, tool.provider);
    const lowest = entitled ? null : lowestTierWithFeature(CONNECTOR_REQUIRED_FEATURE[tool.provider]);
    return { tool, entitled, availableOn: lowest ? TIER_LABELS[lowest] : null };
  });
}

// ── arguments ───────────────────────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

function bad(message: string): ToolError {
  return new ToolError("invalid_arguments", message, 400);
}

function repoArg(args: Args): string {
  if (!isRepositoryName(args.repo)) throw bad("Give the repository as owner/name.");
  return args.repo;
}

function numberArg(args: Args, name: string): number {
  const value = typeof args[name] === "string" ? Number(args[name]) : args[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10_000_000) throw bad(`Give ${name} as a whole number.`);
  return value;
}

function limitArg(args: Args): number {
  if (args.limit === undefined || args.limit === null || args.limit === "") return TOOL_LIMITS.defaultList;
  const value = typeof args.limit === "string" ? Number(args.limit) : args.limit;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw bad("Give limit as a whole number.");
  return Math.min(value, TOOL_LIMITS.maxList);
}

function stateArg(args: Args): "open" | "closed" | "all" {
  if (args.state === undefined || args.state === null || args.state === "") return "open";
  if (args.state === "open" || args.state === "closed" || args.state === "all") return args.state;
  throw bad("state is open, closed or all.");
}

function textArg(args: Args, name: string, max: number): string {
  const value = typeof args[name] === "string" ? (args[name] as string).trim() : "";
  if (!value) throw bad(`Give ${name}.`);
  if (value.length > max) throw bad(`${name} is longer than ${max} characters.`);
  return value;
}

function issueRefArg(args: Args): string {
  const value = typeof args.id === "string" ? args.id.trim() : "";
  if (!isLinearIssueRef(value)) throw bad("Give the Linear issue as its key, for example ENG-123.");
  return value.toUpperCase().includes("-") && !/^[0-9a-f]{8}-/i.test(value) ? value.toUpperCase() : value;
}

function refArg(args: Args): string | null {
  if (args.ref === undefined || args.ref === null || args.ref === "") return null;
  if (typeof args.ref !== "string" || !/^[A-Za-z0-9._/-]{1,200}$/.test(args.ref) || args.ref.includes("..")) throw bad("ref is a branch, tag or commit name.");
  return args.ref;
}

function clip(text: string | null | undefined, max: number = TOOL_LIMITS.maxText): string {
  const value = text ?? "";
  return value.length > max ? `${value.slice(0, max)}… (${(value.length - max).toLocaleString("en-US")} more characters)` : value;
}

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────────

type RepoJson = { full_name: string; description: string | null; default_branch: string; private: boolean; html_url: string; open_issues_count?: number; pushed_at?: string | null; archived?: boolean; permissions?: { push?: boolean; admin?: boolean } };
type UserJson = { login: string } | null;
type IssueJson = { number: number; title: string; state: string; html_url: string; body: string | null; user: UserJson; labels: ({ name?: string } | string)[]; assignees?: { login: string }[]; comments: number; created_at: string; updated_at: string; pull_request?: unknown };
type CommentJson = { user: UserJson; body: string | null; created_at: string; html_url: string };
type PullJson = { number: number; title: string; state: string; html_url: string; body: string | null; user: UserJson; draft?: boolean; merged_at?: string | null; head: { ref: string }; base: { ref: string }; created_at: string; updated_at: string };
type PullFileJson = { filename: string; status: string; additions: number; deletions: number };
type ContentJson = { type?: string; encoding?: string; content?: string; size?: number; path?: string; sha?: string };

const repoView = (r: RepoJson) => ({
  fullName: r.full_name,
  description: r.description ?? null,
  defaultBranch: r.default_branch,
  private: r.private,
  archived: r.archived === true,
  canPush: r.permissions?.push === true || r.permissions?.admin === true,
  openIssues: r.open_issues_count ?? null,
  pushedAt: r.pushed_at ?? null,
  url: r.html_url,
});

const issueView = (i: IssueJson) => ({
  number: i.number,
  title: i.title,
  state: i.state,
  author: i.user?.login ?? null,
  labels: i.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
  assignees: (i.assignees ?? []).map((a) => a.login),
  comments: i.comments,
  createdAt: i.created_at,
  updatedAt: i.updated_at,
  url: i.html_url,
});

const pullView = (p: PullJson) => ({
  number: p.number,
  title: p.title,
  state: p.merged_at ? "merged" : p.state,
  draft: p.draft === true,
  author: p.user?.login ?? null,
  head: p.head.ref,
  base: p.base.ref,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  url: p.html_url,
});

async function runGitHub(tool: string, args: Args, github: GitHubClient): Promise<unknown> {
  switch (tool) {
    case "github.repositories": {
      const limit = limitArg(args);
      const repos = (await github.get<RepoJson[]>(`/user/repos?per_page=${limit}&sort=pushed&affiliation=owner,collaborator,organization_member`)) ?? [];
      return { repositories: repos.slice(0, limit).map(repoView) };
    }
    case "github.repository": {
      const repo = repoArg(args);
      const data = await github.get<RepoJson>(`/repos/${repo}`);
      if (!data) throw new ToolError("not_found", "That repository wasn't found on GitHub.", 404);
      return { repository: repoView(data) };
    }
    case "github.issues": {
      const repo = repoArg(args);
      const limit = limitArg(args);
      // GitHub's issues list includes pull requests; asking for more and dropping them keeps the count honest.
      const items = (await github.get<IssueJson[]>(`/repos/${repo}/issues?state=${stateArg(args)}&per_page=${Math.min(100, limit * 2)}&sort=updated`)) ?? [];
      return { repository: repo, issues: items.filter((i) => !i.pull_request).slice(0, limit).map(issueView) };
    }
    case "github.issue": {
      const repo = repoArg(args);
      const number = numberArg(args, "number");
      const issue = await github.get<IssueJson>(`/repos/${repo}/issues/${number}`);
      if (!issue) throw new ToolError("not_found", "That issue wasn't found on GitHub.", 404);
      const comments = issue.comments > 0 ? ((await github.get<CommentJson[]>(`/repos/${repo}/issues/${number}/comments?per_page=${TOOL_LIMITS.maxComments}`)) ?? []) : [];
      return {
        repository: repo,
        issue: { ...issueView(issue), isPullRequest: Boolean(issue.pull_request), body: clip(issue.body) },
        comments: comments.map((c) => ({ author: c.user?.login ?? null, createdAt: c.created_at, body: clip(c.body, 2_000), url: c.html_url })),
      };
    }
    case "github.pulls": {
      const repo = repoArg(args);
      const limit = limitArg(args);
      const pulls = (await github.get<PullJson[]>(`/repos/${repo}/pulls?state=${stateArg(args)}&per_page=${limit}&sort=updated&direction=desc`)) ?? [];
      return { repository: repo, pulls: pulls.slice(0, limit).map(pullView) };
    }
    case "github.pull": {
      const repo = repoArg(args);
      const number = numberArg(args, "number");
      const pull = await github.get<PullJson>(`/repos/${repo}/pulls/${number}`);
      if (!pull) throw new ToolError("not_found", "That pull request wasn't found on GitHub.", 404);
      const files = (await github.get<PullFileJson[]>(`/repos/${repo}/pulls/${number}/files?per_page=${TOOL_LIMITS.maxPullFiles}`)) ?? [];
      return { repository: repo, pull: { ...pullView(pull), body: clip(pull.body) }, files: files.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })) };
    }
    case "github.file": {
      const repo = repoArg(args);
      const path = normaliseRepoPath(args.path);
      // The same never-edited list Code mode uses: secrets, keys, lockfiles, CI, build output, binaries.
      if (!path || !isFullScopePath(path)) throw new ToolError("path_not_allowed", "PawOS doesn't read that file (secrets, keys, lockfiles, CI workflows, build output and binary files are never read).", 403);
      const ref = refArg(args);
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const data = await github.get<ContentJson>(`/repos/${repo}/contents/${encoded}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
      if (!data || data.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") throw new ToolError("not_found", "That file wasn't found on GitHub.", 404);
      if ((data.size ?? 0) > TOOL_LIMITS.maxFileBytes) throw new ToolError("too_large", `That file is larger than ${TOOL_LIMITS.maxFileBytes / 1000} KB.`, 413);
      const text = Buffer.from(data.content, "base64").toString("utf8");
      if (text.includes("\u0000")) throw new ToolError("path_not_allowed", "That is a binary file.", 415);
      return { repository: repo, path, ref, content: text };
    }
    case "github.comment": {
      const repo = repoArg(args);
      const number = numberArg(args, "number");
      const body = textArg(args, "body", TOOL_LIMITS.maxComment);
      const posted = await github.commentOnIssue(repo, number, body);
      return { repository: repo, number, commented: true, url: posted.url };
    }
  }
  throw new ToolError("unknown_tool", "PawOS has no tool by that name.", 404);
}

// ── Linear ──────────────────────────────────────────────────────────────────────────────────────

const linearListView = (i: LinearIssue) => ({ key: i.key, title: i.title, status: i.status, priority: i.priority, labels: i.labels, assignee: i.assignee, dueDate: i.dueDate, url: i.url });

async function runLinear(tool: string, args: Args, linear: LinearClient): Promise<unknown> {
  switch (tool) {
    case "linear.myIssues":
      return { issues: (await linear.myIssues(limitArg(args))).map(linearListView) };
    case "linear.issue": {
      const issue = await linear.issue(issueRefArg(args));
      return { issue: { ...linearListView(issue), reporter: issue.reporter, description: clip(issue.description) } };
    }
    case "linear.search":
      return { query: textArg(args, "query", 200), issues: (await linear.search(textArg(args, "query", 200), limitArg(args))).map(linearListView) };
    case "linear.comment": {
      const ref = issueRefArg(args);
      const body = textArg(args, "body", TOOL_LIMITS.maxComment);
      const posted = await linear.comment(ref, body);
      return { key: ref, commented: true, url: posted.url };
    }
  }
  throw new ToolError("unknown_tool", "PawOS has no tool by that name.", 404);
}

// ── running a tool ──────────────────────────────────────────────────────────────────────────────

function fromServiceError(error: unknown, provider: ToolProvider): ToolError {
  const name = provider === "github" ? "GitHub" : "Linear";
  if (error instanceof GitHubError || error instanceof LinearError) {
    const status = error.code === "not_connected" || error.code === "needs_reauth" ? 409 : error.code === "no_access" ? 403 : error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 502;
    return new ToolError(error.code, error.message, status, { provider });
  }
  return new ToolError("unavailable", `${name} couldn't complete that. Please try again.`, 502, { provider });
}

export interface ToolCallInput {
  tool: unknown;
  args?: unknown;
  confirmed?: unknown;
}

export async function runConnectedTool(account: AccountContext, input: ToolCallInput): Promise<{ tool: string; access: ToolAccess; data: unknown }> {
  requireWebCapability(account, "web.connectedTools");
  const tool = findTool(input.tool);
  if (!tool) throw new ToolError("unknown_tool", "PawOS has no tool by that name.", 404);
  if (!isIntegrationEntitled(account, tool.provider)) {
    const lowest = lowestTierWithFeature(CONNECTOR_REQUIRED_FEATURE[tool.provider]);
    throw new ToolError("not_entitled", `${tool.provider === "github" ? "GitHub" : "Linear"} isn't included in your plan.`, 403, { provider: tool.provider, availableOn: lowest ? TIER_LABELS[lowest] : null });
  }
  if (tool.access === "write" && input.confirmed !== true) {
    throw new ToolError("confirmation_required", "This changes something in a connected service. Ask the user, then send it again with confirmed: true.", 428, { tool: tool.name });
  }
  const args: Args = input.args && typeof input.args === "object" && !Array.isArray(input.args) ? (input.args as Args) : {};
  // Arguments are checked before any credential is read.
  validateOnly(tool, args);
  try {
    const data = tool.provider === "github" ? await runGitHub(tool.name, args, await githubClientFor(account)) : await runLinear(tool.name, args, await linearClientFor(account));
    return { tool: tool.name, access: tool.access, data };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw fromServiceError(error, tool.provider);
  }
}

/** Runs each argument check for a tool without calling the service (they throw ToolError). */
function validateOnly(tool: ToolDefinition, args: Args): void {
  for (const raw of Object.keys(tool.args)) {
    const name = raw.replace(/\?$/, "");
    const optional = raw.endsWith("?");
    if (optional && (args[name] === undefined || args[name] === null || args[name] === "")) continue;
    if (name === "repo") repoArg(args);
    else if (name === "number") numberArg(args, "number");
    else if (name === "limit") limitArg(args);
    else if (name === "state") stateArg(args);
    else if (name === "ref") refArg(args);
    else if (name === "id") issueRefArg(args);
    else if (name === "body") textArg(args, "body", TOOL_LIMITS.maxComment);
    else if (name === "query") textArg(args, "query", 200);
    else if (name === "path" && !normaliseRepoPath(args.path)) throw bad("Give the file's path inside the repository.");
  }
  const allowed = new Set(Object.keys(tool.args).map((k) => k.replace(/\?$/, "")));
  const extra = Object.keys(args).filter((k) => !allowed.has(k));
  if (extra.length > 0) throw bad(`${tool.name} doesn't take ${extra.join(", ")}.`);
}
