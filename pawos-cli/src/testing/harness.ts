import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CliSessionStore, type Keyring } from "../auth/sessionStore";
import type { CliContext } from "../context";
import type { LocalRepository } from "../git/localRepository";
import { INTERRUPT } from "./keys";
import { PawosClient, SessionManager, runTask, sendChatMessage, type AccountOverview, type CodeChange, type CodeChangeStep, type FetchLike, type Integration, type RepositoryReadiness } from "../shared";
import { PendingTaskStore } from "../state/pendingTask";
import type { Prompter } from "../ui/prompts";
import type { Timers } from "../ui/spinner";
import { Terminal, type TerminalCapabilities } from "../ui/terminal";

/**
 * Test-only. The real commands, the real session manager, API client, task runner and session
 * store — run against a scripted PawOS, a fake credential store, a scripted keyboard and a captured
 * screen. Nothing here can reach a real account, a real repository or the network.
 */
export const API = "https://pawos.test";
/** A handoff as PawOS issues it (43 base64url characters), and the completion address that carries it. */
export const HANDOFF = "h".repeat(43);
export const completionUrl = (handoff: string = HANDOFF, origin: string = API) => `${origin}/auth/device/complete?handoff=${handoff}`;
export { INTERRUPT };
export const ALICE = { email: "alice@example.com", name: "Alice Example", plan: { tier: "pro", label: "Paw Pro" } };
/** Nine in the morning on this computer, whatever its time zone. */
export const MORNING = new Date(2026, 9, 8, 9, 0, 0);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const step = (id: string, label: string, status: CodeChangeStep["status"], detail?: string): CodeChangeStep => ({ id, label, status, ...(detail ? { detail } : {}) });

export function change(requestId: string, overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    requestId,
    repository: "acme/site",
    state: "running",
    steps: [step("read", "Read the repository", "done", "42 files"), step("plan", "Choose the files", "active"), step("write", "Write the change", "pending"), step("check", "Check for problems", "pending"), step("push", "Commit and push to main", "pending"), step("preview", "Preview and checks", "pending")],
    branch: null,
    commitSha: null,
    commitUrl: null,
    pullRequestUrl: null,
    files: [],
    summary: null,
    previewUrl: null,
    checksState: "pending",
    fixAttempts: 0,
    error: null,
    ...overrides,
  };
}

export function pushed(requestId: string, overrides: Partial<CodeChange> = {}): CodeChange {
  return change(requestId, {
    state: "done",
    steps: [step("read", "Read the repository", "done"), step("plan", "Choose the files", "done"), step("write", "Write the change", "done"), step("check", "Check for problems", "done"), step("push", "Commit and push to main", "done", "abc1234 on main"), step("preview", "Preview and checks", "done")],
    branch: "main",
    commitSha: "abc1234def5678",
    commitUrl: "https://github.com/acme/site/commit/abc1234def5678",
    files: ["src/auth/middleware.ts", "src/auth/middleware.test.ts"],
    summary: "Fixed authentication token handling.",
    checksState: "success",
    ...overrides,
  });
}

/** A connector as PawOS lists it for an account. */
export function integration(id: string, name: string, overrides: Partial<Integration> = {}): Integration {
  return { id, name, description: `${name} for PawOS.`, group: "integrations", entitled: true, availableOn: null, connection: "notConnected", accountLabel: null, connectedAt: null, mcp: null, ...overrides };
}

/** The capabilities PawOS Web reports today (pawos-web/src/lib/webPolicy/webCapabilities.ts), for a plan that has them all. */
export const CAPABILITIES = [
  { id: "web.chat", label: "Chat", status: "available", availableOn: null },
  { id: "web.codeChanges", label: "Code changes", status: "available", availableOn: null },
  { id: "web.integrationContext", label: "Integration context", status: "desktopOnly", availableOn: null },
  { id: "web.mcpRead", label: "MCP read access", status: "desktopOnly", availableOn: null },
  { id: "web.autonomousWork", label: "Autonomous Work", status: "future", availableOn: null },
] as const;

export interface RecordedCall {
  method: string;
  path: string;
  /** The query string, when there is one (e.g. "?chat=…"). */
  query?: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

type Scripted = Response | Error | (() => Response | Error);
const play = (entry: Scripted): Response => {
  const value = typeof entry === "function" ? entry() : entry;
  if (value instanceof Error) throw value;
  return value.clone();
};

/** A scripted PawOS: the device sign-in endpoints and the existing Web API the CLI calls. */
export class FakePawos {
  calls: RecordedCall[] = [];
  /** One-time handoffs PawOS would accept, and whether they have expired. */
  handoffs = new Map<string, "valid" | "expired">();
  validAccess = new Set<string>();
  validRefresh = new Set<string>();
  private issued = 0;
  readiness: RepositoryReadiness = { state: "ready", repository: { fullName: "acme/site", defaultBranch: "main" }, scope: "full" };
  capabilitiesAnswer: Scripted | null = null;
  plan: { tier: string; label: string } = ALICE.plan;
  /** The account holder's name as PawOS has it (null: none on record). */
  name: string | null = ALICE.name;
  /** GET /api/dashboard/overview: the account's usage as the server reports it (null: nothing to report). */
  usage: AccountOverview["usage"] = null;
  overviewAnswer: Scripted | null = null;
  /** The account's previous conversations and code tasks, as GET /api/web-chat/chats lists them (none: a new account). */
  previousChats: unknown = [];
  chatsAnswer: Scripted | null = null;
  /** The messages of the account's earlier conversations, by chat id. */
  chatMessages = new Map<string, unknown>();
  /** The account's connectors, as GET /api/dashboard/integrations lists them. */
  integrations: Integration[] = [integration("github", "GitHub", { group: "sourceControl" }), integration("slack", "Slack"), integration("linear", "Linear", { entitled: false, availableOn: "Paw Pro Max" })];
  /** Connectors PawOS connects from its web Integrations page; the rest are connected from the desktop app. */
  webConnectable = new Set(["github"]);
  /** Answers to chat messages (no mode), in order; when they run out PawOS gives a plain reply. */
  chatReplies: Scripted[] = [];
  selectAnswer: Scripted | null = null;
  /** Answers to POST /api/web-chat/messages that start a task, in order. */
  sends: Scripted[] = [];
  /** Answers to recoverOnly lookups, in order (the last repeats). */
  recoveries: Scripted[] = [];
  /** What GET /api/web/changes returns on each poll (the last repeats). */
  polls: (CodeChange | null)[] = [null];
  pollCount = 0;
  private waiters: { at: number; release: () => void }[] = [];

  /** A sign-in session as PawOS would issue it. */
  issueSession(): { accessToken: string; refreshToken: string; expiresAt: number; email: string } {
    this.issued += 1;
    const session = { accessToken: `access-${this.issued}.jwt.sig`, refreshToken: `refresh-${this.issued}`, expiresAt: Math.floor(Date.now() / 1000) + 3600, email: ALICE.email };
    this.validAccess.add(session.accessToken);
    this.validRefresh.add(session.refreshToken);
    return session;
  }

  /** An answer that arrives only after the CLI has polled for progress `count` times. */
  afterPolls(count: number, response: Response): () => Promise<Response> {
    return () =>
      new Promise<Response>((resolve) => {
        if (this.pollCount >= count) resolve(response.clone());
        else this.waiters.push({ at: count, release: () => resolve(response.clone()) });
      });
  }

  /** Code tasks that were started (mode: codeChange). */
  starts(): RecordedCall[] {
    return this.calls.filter((call) => call.path === "/api/web-chat/messages" && call.body?.recoverOnly !== true && call.body?.mode === "codeChange");
  }

  /** Chat messages that were sent (no mode). */
  chats(): RecordedCall[] {
    return this.calls.filter((call) => call.path === "/api/web-chat/messages" && call.body?.recoverOnly !== true && call.body?.mode === undefined);
  }

  recovers(): RecordedCall[] {
    return this.calls.filter((call) => call.path === "/api/web-chat/messages" && call.body?.recoverOnly === true);
  }

  readonly fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    if (url.origin !== API) throw new Error(`The CLI called something other than PawOS: ${url.origin}`);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: RecordedCall = { method: init?.method ?? "GET", path: url.pathname, ...(url.search ? { query: url.search } : {}), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null, authorization: headers.Authorization ?? null };
    this.calls.push(call);
    const route = `${call.method} ${call.path}`;

    if (route === "POST /api/auth/device/exchange") {
      const handoff = String(call.body?.handoff ?? "");
      const known = this.handoffs.get(handoff);
      this.handoffs.delete(handoff); // single use, whatever happens
      const rightClient = call.body?.client === "cli";
      if (known === "valid" && rightClient && typeof call.body?.verifier === "string" && call.body.verifier.length >= 43) return json(200, { ok: true, session: this.issueSession() });
      if (known === "expired") return json(400, { ok: false, code: "handoff_expired", message: "That authentication URL has expired. Start sign-in again." });
      return json(400, { ok: false, code: "invalid_handoff", message: "That authentication URL isn't valid or has already been used. Start sign-in again." });
    }
    if (route === "POST /api/auth/device/refresh") {
      const token = String(call.body?.refreshToken ?? "");
      if (!this.validRefresh.has(token)) return json(401, { ok: false, code: "session_expired", message: "Your PawOS session has expired. Sign in again." });
      this.validRefresh.delete(token);
      return json(200, { ok: true, session: this.issueSession() });
    }
    if (route === "POST /api/auth/device/logout") {
      this.validAccess.delete((call.authorization ?? "").replace(/^Bearer /, ""));
      return json(200, { ok: true });
    }

    if (!call.authorization?.startsWith("Bearer ") || !this.validAccess.has(call.authorization.slice(7))) {
      return json(401, { ok: false, code: "not_authenticated", message: "Sign in to continue." });
    }
    if (route === "GET /api/web/capabilities") {
      return this.capabilitiesAnswer ? play(this.capabilitiesAnswer) : json(200, { ok: true, plan: this.plan, user: { name: this.name }, capabilities: CAPABILITIES });
    }
    if (route === "GET /api/dashboard/overview") {
      if (this.overviewAnswer) return play(this.overviewAnswer);
      return json(200, { ok: true, plan: this.plan, usage: this.usage, integrations: { connected: this.integrations.filter((item) => item.connection === "connected").map((item) => item.id), available: this.integrations.filter((item) => item.entitled).length, total: this.integrations.length } });
    }
    if (route === "GET /api/web-chat/chats") {
      if (this.chatsAnswer) return play(this.chatsAnswer);
      const wanted = url.searchParams.get("chat");
      if (wanted === null) return json(200, { ok: true, chats: this.previousChats, allowance: { messageLimit: null, remaining: null } });
      if (!this.chatMessages.has(wanted)) return json(404, { ok: false, code: "chat_not_found", message: "That chat doesn't exist." });
      return json(200, { ok: true, chats: this.previousChats, allowance: { messageLimit: null, remaining: null }, messages: this.chatMessages.get(wanted) });
    }
    if (route === "GET /api/dashboard/integrations") return json(200, { ok: true, tier: this.plan.label, integrations: this.integrations });
    if (call.method === "POST" && call.path.startsWith("/api/dashboard/integrations/")) {
      const found = this.integrations.find((item) => item.id === call.path.split("/").pop());
      if (!found) return json(404, { ok: false, code: "unknown_connector", message: "PawOS doesn't support that integration." });
      if (!found.entitled) return json(403, { ok: false, code: "not_entitled", message: `${found.name} is available on a higher plan.` });
      // The address PawOS returns for a browser carries an OAuth state bound to that browser's cookie.
      if (this.webConnectable.has(found.id)) return json(200, { ok: true, connect: { method: "redirect", url: `https://provider.example/oauth/authorize?client_id=PAWOS_CLIENT_ID&state=web.${found.id}.SECRET_STATE` } });
      return json(200, { ok: true, connect: { method: "desktop", message: `Open PawOS on your desktop, go to Settings → Connections and connect ${found.name}. It will show as connected here once it's done.` } });
    }
    if (route === "GET /api/web/github/repository") return json(200, { ok: true, readiness: this.readiness });
    if (route === "PUT /api/web/github/repository") {
      if (this.selectAnswer) return play(this.selectAnswer);
      this.readiness = { state: "ready", repository: { fullName: String(call.body?.fullName), defaultBranch: "main" }, scope: "full" };
      return json(200, { ok: true, readiness: this.readiness });
    }
    if (route === "POST /api/web-chat/messages") {
      if (call.body?.recoverOnly === true) {
        const next = this.recoveries.length > 1 ? this.recoveries.shift()! : this.recoveries[0];
        return next ? play(next) : json(404, { ok: false, code: "not_found", message: "That message wasn't received." });
      }
      if (call.body?.mode === undefined) {
        const scripted = this.chatReplies.shift();
        if (scripted) return play(scripted);
        return json(200, { ok: true, chatId: typeof call.body?.chatId === "string" ? call.body.chatId : "chat-1", reply: "Here is what I know.", recovered: false, requiresDesktop: false, allowance: { messageLimit: null, remaining: null } });
      }
      const next = this.sends.shift();
      if (!next) throw new Error("The CLI started a task the test did not expect.");
      const value = typeof next === "function" ? await next() : next;
      if (value instanceof Error) throw value;
      return value.clone();
    }
    if (call.method === "GET" && call.path.startsWith("/api/web/changes/")) {
      const current = this.polls[Math.min(this.pollCount, this.polls.length - 1)] ?? null;
      this.pollCount += 1;
      for (const waiter of this.waiters.filter((entry) => entry.at <= this.pollCount)) waiter.release();
      this.waiters = this.waiters.filter((entry) => entry.at > this.pollCount);
      return current ? json(200, { ok: true, change: current }) : json(404, { ok: false, code: "not_found", message: "That change doesn't exist." });
    }
    return json(404, { ok: false, code: "not_found", message: "No such route." });
  };
}

export const reply = (body: Record<string, unknown>, status = 200) => json(status, { ok: status < 300, ...body });
export const delivered = (requestId: string, changeView: CodeChange | null, text = "Done — I pushed the change.") => reply({ chatId: "chat-1", reply: text, recovered: false, requiresDesktop: false, change: changeView });

export class MemoryKeyring implements Keyring {
  value: string | null = null;
  broken = false;
  get(): string | null {
    if (this.broken) throw new Error("credential store unavailable");
    return this.value;
  }
  set(value: string): void {
    if (this.broken) throw new Error("credential store unavailable");
    this.value = value;
  }
  delete(): void {
    if (this.broken) throw new Error("credential store unavailable");
    this.value = null;
  }
}

/**
 * A keyboard with the answers already typed. INTERRUPT is the user pressing Ctrl+C at the prompt;
 * when the answers run out, input has ended (as Ctrl+D would).
 */
export class ScriptedPrompter implements Prompter {
  prompts: string[] = [];
  interrupted = false;
  constructor(
    private answers: (string | null | typeof INTERRUPT)[],
    private readonly echo: (text: string) => void
  ) {}
  async ask(prompt: string): Promise<string | null> {
    this.prompts.push(prompt);
    this.echo(prompt);
    const next = this.answers.length > 0 ? this.answers.shift()! : null;
    this.interrupted = next === INTERRUPT;
    const answer = next === INTERRUPT ? null : next;
    this.echo(`${answer ?? ""}\n`);
    return answer;
  }
  close(): void {}
}

export class ManualTimers implements Timers {
  private handlers = new Map<number, () => void>();
  private next = 1;
  cleared = 0;
  setInterval(run: () => void): unknown {
    this.handlers.set(this.next, run);
    return this.next++;
  }
  clearInterval(handle: unknown): void {
    if (this.handlers.delete(handle as number)) this.cleared += 1;
  }
  get active(): number {
    return this.handlers.size;
  }
  tick(times = 1): void {
    for (let count = 0; count < times; count++) for (const run of [...this.handlers.values()]) run();
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\]8;;[^\u001b]*\u001b\\/g;
export const stripAnsi = (text: string) => text.replace(ANSI, "");

export const STATIC_TERMINAL: TerminalCapabilities = { interactive: false, color: false, unicode: true, hyperlinks: false, columns: 100 };
export const LIVE_TERMINAL: TerminalCapabilities = { interactive: true, color: true, unicode: true, hyperlinks: true, columns: 100 };

export interface HarnessOptions {
  answers?: (string | null | typeof INTERRUPT)[];
  /** The folder `pawos` was started in, and the branch Git reports there (null: none, e.g. a detached HEAD). */
  cwd?: string;
  branch?: string | null;
  /** Start already signed in (a session from an earlier run is in the credential store). */
  signedIn?: boolean;
  local?: LocalRepository;
  caps?: TerminalCapabilities;
  keyring?: MemoryKeyring | null;
  apiProblem?: string;
  /** The time on the user's computer (default: nine in the morning). */
  now?: Date;
  /** How much PawOS asks before a code change (default here: auto, so a test's task is sent as typed). */
  permissionMode?: "ask" | "auto" | "plan";
  /** Play the startup animation (needs a terminal that redraws; the test moves the frames with `timers.tick`). */
  intro?: boolean;
}

export function harness(options: HarnessOptions = {}) {
  const server = new FakePawos();
  const chunks: string[] = [];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pawos-cli-test-"));
  const keyring = options.keyring === undefined ? new MemoryKeyring() : options.keyring;
  const cwd = options.cwd ?? "C:\\Projects\\MyApp";
  const local: LocalRepository = options.local ?? { kind: "github", fullName: "acme/site", remote: "origin" };
  const inGit = local.kind !== "notGit" && local.kind !== "gitMissing";
  const store = new CliSessionStore(keyring, directory, cwd);
  if (options.signedIn) {
    const session = server.issueSession();
    server.validAccess.delete(session.accessToken); // only the refresh token survives between runs
    if (keyring) keyring.value = JSON.stringify({ refreshToken: session.refreshToken, email: session.email });
    else fs.writeFileSync(path.join(directory, "session.json"), JSON.stringify({ refreshToken: session.refreshToken, email: session.email }));
  }
  const config = options.apiProblem ? ({ ok: false, problem: options.apiProblem } as const) : ({ ok: true, config: { apiBaseUrl: API } } as const);
  const session = new SessionManager({ storage: store, getApiBaseUrl: () => API, fetchImpl: server.fetch });
  const client = new PawosClient(() => API, (forceRefresh) => session.getAccessToken(forceRefresh), () => session.expire(), server.fetch);
  const term = new Terminal({ write: (text) => chunks.push(text), isTTY: options.caps?.interactive ?? false, columns: 100 }, options.caps ?? STATIC_TERMINAL);
  const timers = new ManualTimers();
  const interruptHandlers = new Set<() => void>();
  let interruptPending = false;
  let clock = 0;
  const prompter = new ScriptedPrompter(options.answers ?? [], (text) => chunks.push(text));

  const ctx: CliContext = {
    term,
    prompter,
    version: "0.1.0",
    config,
    session,
    store,
    client,
    pending: new PendingTaskStore(directory),
    detectProject: async () => ({ cwd, branch: inGit ? (options.branch === undefined ? "main" : options.branch) : null, repository: local }),
    // The real task runner, with time that only moves when it waits.
    run: (taskOptions) => runTask({ ...taskOptions, sleep: async (ms) => void (clock += ms), now: () => clock }),
    // The real chat sender, with the same clock.
    chat: (chatOptions) => sendChatMessage({ ...chatOptions, sleep: async (ms) => void (clock += ms), now: () => clock }),
    onInterrupt: (handler) => {
      interruptHandlers.add(handler);
      return () => interruptHandlers.delete(handler);
    },
    takeInterrupt: () => {
      const was = interruptPending;
      interruptPending = false;
      return was;
    },
    timers,
    now: () => options.now ?? MORNING,
    animateStartup: options.intro === true,
    permissionMode: options.permissionMode ?? "auto",
  };

  return {
    ctx,
    server,
    keyring,
    store,
    directory,
    /** The sign-in addresses the CLI printed, in order. */
    signInUrls: () => stripAnsi(chunks.join("")).match(/https:\/\/pawos\.test\/auth\/device\?\S+/g) ?? [],
    timers,
    prompter,
    raw: () => chunks.join(""),
    output: () => stripAnsi(chunks.join("")),
    interrupt: () => {
      if (interruptHandlers.size === 0) interruptPending = true;
      for (const handler of [...interruptHandlers]) handler();
    },
    listening: () => interruptHandlers.size,
    elapsed: () => clock,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}
