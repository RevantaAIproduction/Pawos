/**
 * Test-only stand-in for the slice of the GitHub REST API PawOS Web uses for frontend changes:
 * repositories, refs, trees, file contents, commits and pull requests. In memory; it checks the
 * bearer token, so a test can prove which credential the server used.
 */

interface FakeRepo {
  fullName: string;
  defaultBranch: string;
  canPush: boolean;
  private: boolean;
  /** branch → commit sha */
  refs: Map<string, string>;
  /** commit sha → { tree: path → content, parent } */
  commits: Map<string, { files: Map<string, string>; parent: string | null; message: string }>;
  pulls: { number: number; head: string; base: string; title: string; body: string; html_url: string }[];
  /** Branches GitHub refuses direct pushes to (branch protection). */
  protectedBranches: Set<string>;
}

/** What CI and deployment providers have reported for a commit. */
export interface FakeCommitSignals {
  deployments?: { environment: string; state: "pending" | "success" | "failure"; url?: string }[];
  statuses?: { context: string; state: "pending" | "success" | "failure"; target_url?: string; description?: string }[];
  checks?: { id: number; name: string; status: "queued" | "in_progress" | "completed"; conclusion?: "success" | "failure" | null; title?: string; summary?: string; annotations?: { path: string; start_line: number; message: string }[] }[];
}

export interface FakeGitHubCall {
  method: string;
  path: string;
  body: unknown;
}

export class FakeGitHub {
  repos = new Map<string, FakeRepo>();
  calls: FakeGitHubCall[] = [];
  /** commit sha → what providers reported. Unset = nothing reported (yet). */
  signals = new Map<string, FakeCommitSignals>();
  /** deployment id → which commit's which deployment. */
  private deploymentIds = new Map<number, { sha: string; index: number }>();
  /** Called for every commit pushed to a branch, so a test can decide what CI says about it. */
  onPush: ((repo: string, branch: string, sha: string, files: Record<string, string>) => void) | null = null;
  private seq = 0;

  constructor(readonly token: string) {}

  addRepo(fullName: string, files: Record<string, string>, options: { canPush?: boolean; defaultBranch?: string } = {}) {
    const sha = this.nextSha();
    const defaultBranch = options.defaultBranch ?? "main";
    this.repos.set(fullName, {
      fullName,
      defaultBranch,
      canPush: options.canPush ?? true,
      private: true,
      refs: new Map([[defaultBranch, sha]]),
      commits: new Map([[sha, { files: new Map(Object.entries(files)), parent: null, message: "initial" }]]),
      pulls: [],
      protectedBranches: new Set(),
    });
  }

  headOf(fullName: string, branch: string): string | null {
    return this.repos.get(fullName)?.refs.get(branch) ?? null;
  }

  /** Someone else pushes to a branch (to test a branch moving while PawOS works). */
  pushAsSomeoneElse(fullName: string, branch: string, changes: Record<string, string>) {
    const repo = this.repos.get(fullName);
    const head = repo?.refs.get(branch);
    if (!repo || !head) return;
    const files = new Map(repo.commits.get(head)?.files ?? []);
    for (const [path, content] of Object.entries(changes)) files.set(path, content);
    const sha = this.nextSha();
    repo.commits.set(sha, { files, parent: head, message: "someone else" });
    repo.refs.set(branch, sha);
  }

  commitMessage(fullName: string, sha: string): string | null {
    return this.repos.get(fullName)?.commits.get(sha)?.message ?? null;
  }

  /** Files on a branch, as GitHub would serve them. */
  filesOn(fullName: string, branch: string): Record<string, string> | null {
    const repo = this.repos.get(fullName);
    const sha = repo?.refs.get(branch);
    const commit = sha ? repo?.commits.get(sha) : undefined;
    return commit ? Object.fromEntries(commit.files) : null;
  }

  writes(): FakeGitHubCall[] {
    return this.calls.filter((call) => call.method !== "GET");
  }

  private nextSha(): string {
    this.seq += 1;
    return `sha${String(this.seq).padStart(37, "0")}`;
  }

  /** Answers one request the way api.github.com would (only what PawOS Web uses). */
  handle(method: string, rawUrl: string, authorization: string | null, body: unknown): { status: number; json: unknown } {
    const url = new URL(rawUrl, "https://api.github.com");
    const path = url.pathname;
    this.calls.push({ method, path: `${path}${url.search}`, body });
    if (authorization !== `Bearer ${this.token}`) return { status: 401, json: { message: "Bad credentials" } };

    if (method === "GET" && path === "/user/repos") {
      return { status: 200, json: [...this.repos.values()].map((repo) => this.repoJson(repo)) };
    }
    const match = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    const repo = match ? this.repos.get(match[1]) : undefined;
    if (!match || !repo) return { status: 404, json: { message: "Not Found" } };
    const rest = match[2] ?? "";

    if (method === "GET" && rest === "") return { status: 200, json: this.repoJson(repo) };

    let m = rest.match(/^\/git\/ref\/heads\/(.+)$/);
    if (method === "GET" && m) {
      const sha = repo.refs.get(decodeURIComponent(m[1]));
      return sha ? { status: 200, json: { object: { sha } } } : { status: 404, json: { message: "Not Found" } };
    }
    m = rest.match(/^\/git\/trees\/([^/?]+)$/);
    if (method === "GET" && m) {
      const commit = repo.commits.get(m[1]);
      if (!commit) return { status: 404, json: {} };
      return { status: 200, json: { tree: [...commit.files].map(([p, c]) => ({ path: p, type: "blob", size: Buffer.byteLength(c) })) } };
    }
    m = rest.match(/^\/contents\/(.+)$/);
    if (method === "GET" && m) {
      const commit = repo.commits.get(url.searchParams.get("ref") ?? "") ?? repo.commits.get(repo.refs.get(repo.defaultBranch) ?? "");
      const content = commit?.files.get(m[1].split("/").map(decodeURIComponent).join("/"));
      return content === undefined ? { status: 404, json: {} } : { status: 200, json: { content: Buffer.from(content).toString("base64"), encoding: "base64" } };
    }
    m = rest.match(/^\/git\/commits\/([^/]+)$/);
    if (method === "GET" && m) return repo.commits.has(m[1]) ? { status: 200, json: { sha: m[1], tree: { sha: `tree-of-${m[1]}` } } } : { status: 404, json: {} };

    if (!repo.canPush && method !== "GET") return { status: 403, json: { message: "Resource not accessible" } };

    if (method === "POST" && rest === "/git/trees") {
      const input = body as { base_tree: string; tree: { path: string; content: string }[] };
      const baseSha = String(input.base_tree).replace(/^tree-of-/, "");
      const files = new Map(repo.commits.get(baseSha)?.files ?? []);
      for (const entry of input.tree) files.set(entry.path, entry.content);
      const treeSha = this.nextSha();
      repo.commits.set(`tree:${treeSha}`, { files, parent: baseSha, message: "" });
      return { status: 201, json: { sha: treeSha } };
    }
    if (method === "POST" && rest === "/git/commits") {
      const input = body as { message: string; tree: string; parents: string[] };
      const tree = repo.commits.get(`tree:${input.tree}`);
      const sha = this.nextSha();
      repo.commits.set(sha, { files: new Map(tree?.files ?? []), parent: input.parents[0] ?? null, message: input.message });
      return { status: 201, json: { sha } };
    }
    if (method === "POST" && rest === "/git/refs") {
      const input = body as { ref: string; sha: string };
      const branch = input.ref.replace(/^refs\/heads\//, "");
      if (repo.refs.has(branch)) return { status: 422, json: { message: "Reference already exists" } };
      repo.refs.set(branch, input.sha);
      return { status: 201, json: { ref: input.ref } };
    }
    m = rest.match(/^\/git\/refs\/heads\/(.+)$/);
    if (method === "PATCH" && m) {
      const branch = decodeURIComponent(m[1]);
      const input = body as { sha: string; force?: boolean };
      if (repo.protectedBranches.has(branch)) return { status: 422, json: { message: "Protected branch update failed for refs/heads/" + branch } };
      const current = repo.refs.get(branch);
      if (!current) return { status: 422, json: { message: "Reference does not exist" } };
      const next = repo.commits.get(input.sha);
      if (!input.force && next?.parent !== current) return { status: 422, json: { message: "Update is not a fast forward" } };
      repo.refs.set(branch, input.sha);
      this.onPush?.(repo.fullName, branch, input.sha, Object.fromEntries(next?.files ?? []));
      return { status: 200, json: { ref: `refs/heads/${branch}`, object: { sha: input.sha } } };
    }
    m = rest.match(/^\/commits\/([^/]+)\/status$/);
    if (method === "GET" && m) return { status: 200, json: { statuses: (this.signals.get(m[1])?.statuses ?? []).map((s) => ({ ...s, target_url: s.target_url ?? null })) } };
    m = rest.match(/^\/commits\/([^/]+)\/check-runs$/);
    if (method === "GET" && m) {
      return {
        status: 200,
        json: {
          check_runs: (this.signals.get(m[1])?.checks ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion ?? null, output: { title: c.title ?? null, summary: c.summary ?? null, text: null } })),
        },
      };
    }
    if (method === "GET" && rest === "/deployments") {
      const sha = url.searchParams.get("sha") ?? "";
      return {
        status: 200,
        json: (this.signals.get(sha)?.deployments ?? []).map((d, index) => {
          const id = this.deploymentIds.size + 1;
          this.deploymentIds.set(id, { sha, index });
          return { id, environment: d.environment, sha };
        }),
      };
    }
    m = rest.match(/^\/deployments\/(\d+)\/statuses$/);
    if (method === "GET" && m) {
      const ref = this.deploymentIds.get(Number(m[1]));
      const deployment = ref ? this.signals.get(ref.sha)?.deployments?.[ref.index] : undefined;
      return { status: 200, json: deployment ? [{ state: deployment.state, environment_url: deployment.url ?? null }] : [] };
    }
    m = rest.match(/^\/check-runs\/(\d+)\/annotations$/);
    if (method === "GET" && m) {
      for (const signal of this.signals.values()) {
        const check = signal.checks?.find((c) => String(c.id) === m?.[1]);
        if (check) return { status: 200, json: (check.annotations ?? []).map((a) => ({ ...a, annotation_level: "failure" })) };
      }
      return { status: 200, json: [] };
    }
    if (method === "GET" && rest === "/pulls") {
      const head = (url.searchParams.get("head") ?? "").split(":").slice(1).join(":");
      return { status: 200, json: repo.pulls.filter((pull) => pull.head === head) };
    }
    if (method === "POST" && rest === "/pulls") {
      const input = body as { title: string; head: string; base: string; body: string };
      if (!repo.refs.has(input.head)) return { status: 422, json: { message: "head not found" } };
      const number = repo.pulls.length + 1;
      const pull = { number, head: input.head, base: input.base, title: input.title, body: input.body, html_url: `https://github.com/${repo.fullName}/pull/${number}` };
      repo.pulls.push(pull);
      return { status: 201, json: pull };
    }
    return { status: 404, json: { message: `fake GitHub: no route for ${method} ${path}` } };
  }

  private repoJson(repo: FakeRepo) {
    return { full_name: repo.fullName, default_branch: repo.defaultBranch, private: repo.private, permissions: { push: repo.canPush, admin: false, pull: true } };
  }
}
