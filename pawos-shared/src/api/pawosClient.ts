import { AuthRequiredError, type FetchLike } from "../auth/types";
import type { AccountOverview, Capabilities, CodeChange, ConnectStart, Integration, RepositoryReadiness, SendResult } from "./types";

/**
 * A PawOS client's only door to PawOS: the existing PawOS Web API, called as the signed-in account
 * with `Authorization: Bearer <access token>`. Everything that matters — the plan, the capability,
 * usage, GitHub, the model — is decided and done on the server; this file only asks.
 *
 * The token goes in the Authorization header and nowhere else: never in a URL, a body or a log.
 */
export type ApiErrorKind = "unauthenticated" | "forbidden" | "rateLimited" | "server" | "network" | "rejected";

export class PawosApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
    /** The server's own error code, when it sent one (e.g. "repository_not_selected"). */
    readonly code: string | null = null
  ) {
    super(message);
  }

  /** No answer, or an error page from something in between: PawOS may or may not have the request. */
  get uncertain(): boolean {
    return this.kind === "network" || (this.kind === "server" && this.code === null);
  }
}

export type SendOutcome = { kind: "delivered"; result: SendResult } | { kind: "processing" } | { kind: "notReceived" };

type TokenSource = (forceRefresh?: boolean) => Promise<string>;

const DEFAULT_TIMEOUT_MS = 30_000;
/** A code change is one long request; PawOS holds its claim for 300 seconds. */
const SEND_TIMEOUT_MS = 330_000;

interface Answer {
  status: number;
  data: Record<string, unknown>;
}

function failure(status: number, data: Record<string, unknown>): PawosApiError {
  const code = typeof data.code === "string" ? data.code : null;
  const said = typeof data.message === "string" && data.message ? data.message : null;
  if (status === 401) return new PawosApiError("unauthenticated", "Your PawOS session has expired. Sign in again.", status, code);
  if (status === 403) return new PawosApiError("forbidden", said ?? "Your PawOS plan or permissions don't allow that.", status, code);
  if (status === 429) return new PawosApiError("rateLimited", "PawOS is receiving too many requests. Wait a moment and try again.", status, code);
  if (status >= 500) return new PawosApiError("server", (code && said) || "PawOS is having trouble right now. Please try again in a moment.", status, code);
  return new PawosApiError("rejected", said ?? "PawOS couldn't do that.", status, code);
}

export class PawosClient {
  constructor(
    private readonly getBaseUrl: () => string,
    private readonly getToken: TokenSource,
    /** Called when PawOS refuses a freshly refreshed token: the session is over. */
    private readonly onSessionRejected: () => Promise<void> = async () => undefined,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  private async call(method: string, path: string, body: unknown, timeoutMs: number, token: string): Promise<Answer> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.getBaseUrl()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new PawosApiError("network", "PawOS couldn't be reached. Check your connection and try again.");
    }
    const parsed = (await response.json().catch(() => null)) as unknown;
    return { status: response.status, data: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {} };
  }

  /** One request as the signed-in account. A 401 gets exactly one retry with a refreshed token. */
  private async request(method: string, path: string, body?: unknown, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Answer> {
    let token: string;
    try {
      token = await this.getToken();
    } catch (error) {
      if (error instanceof AuthRequiredError) throw new PawosApiError("unauthenticated", error.message, 401);
      throw new PawosApiError("network", "PawOS sign-in couldn't be reached. Check your connection and try again.");
    }
    let answer = await this.call(method, path, body, timeoutMs, token);
    if (answer.status === 401) {
      let fresh: string | null = null;
      try {
        fresh = await this.getToken(true);
      } catch (error) {
        if (!(error instanceof AuthRequiredError)) throw new PawosApiError("network", "PawOS sign-in couldn't be reached. Check your connection and try again.");
      }
      if (fresh) answer = await this.call(method, path, body, timeoutMs, fresh);
      if (!fresh || answer.status === 401) {
        if (fresh) await this.onSessionRejected();
        throw failure(401, answer.data);
      }
    }
    return answer;
  }

  private async json(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const answer = await this.request(method, path, body);
    if (answer.status < 200 || answer.status >= 300 || answer.data.ok !== true) throw failure(answer.status, answer.data);
    return answer.data;
  }

  /** GET /api/web/capabilities — the account's plan and what it may do on PawOS Web. */
  async getCapabilities(): Promise<Capabilities> {
    const data = await this.json("GET", "/api/web/capabilities");
    return { plan: data.plan as Capabilities["plan"], capabilities: (data.capabilities ?? []) as Capabilities["capabilities"] };
  }

  /** GET /api/web/github/repository — whether the account can make code changes, and where. */
  async getRepositoryReadiness(): Promise<RepositoryReadiness> {
    return (await this.json("GET", "/api/web/github/repository")).readiness as RepositoryReadiness;
  }

  /** PUT /api/web/github/repository — select the repository PawOS makes code changes in. */
  async selectRepository(fullName: string): Promise<RepositoryReadiness> {
    return (await this.json("PUT", "/api/web/github/repository", { fullName })).readiness as RepositoryReadiness;
  }

  private async send(body: Record<string, unknown>, recoverOnly: boolean): Promise<SendOutcome> {
    const { status, data } = await this.request("POST", "/api/web-chat/messages", body, recoverOnly ? DEFAULT_TIMEOUT_MS : SEND_TIMEOUT_MS);
    if (status === 202 && data.code === "processing") return { kind: "processing" };
    if (recoverOnly && status === 404 && data.code === "not_found") return { kind: "notReceived" };
    if (status >= 200 && status < 300 && data.ok === true && typeof data.reply === "string" && typeof data.chatId === "string") {
      return { kind: "delivered", result: data as unknown as SendResult };
    }
    throw failure(status, data);
  }

  /** POST /api/web-chat/messages in Code mode — starts the change. Safe to repeat with the same request id. */
  sendCodeChange(content: string, requestId: string): Promise<SendOutcome> {
    return this.send({ content, requestId, mode: "codeChange" }, false);
  }

  /**
   * POST /api/web-chat/messages with no mode — one message to Paw, in the account's own chat history.
   * Safe to repeat with the same request id. `chatId` continues an existing conversation.
   */
  sendChat(content: string, requestId: string, chatId: string | null = null): Promise<SendOutcome> {
    return this.send({ content, requestId, ...(chatId ? { chatId } : {}) }, false);
  }

  /** GET /api/dashboard/overview — the account's plan, usage and connected services, as the server resolves them. */
  async getOverview(): Promise<AccountOverview> {
    const data = await this.json("GET", "/api/dashboard/overview");
    return { plan: data.plan as AccountOverview["plan"], usage: (data.usage ?? null) as AccountOverview["usage"], integrations: (data.integrations ?? null) as AccountOverview["integrations"] };
  }

  /** GET /api/dashboard/integrations — every connector PawOS supports, with this account's entitlement and connection state. */
  async listIntegrations(): Promise<Integration[]> {
    const data = await this.json("GET", "/api/dashboard/integrations");
    return Array.isArray(data.integrations) ? (data.integrations as Integration[]) : [];
  }

  /**
   * POST /api/dashboard/integrations/<id> — asks PawOS whether this account may connect the
   * connector, and where. The server checks the plan; a refusal is thrown as it is. The OAuth
   * address it returns for a browser is deliberately not passed on: it only works from the
   * signed-in browser PawOS issued it to, so a client sends the user to the Integrations page.
   */
  async startConnect(connectorId: string): Promise<ConnectStart> {
    const data = await this.json("POST", `/api/dashboard/integrations/${encodeURIComponent(connectorId)}`, {});
    const connect = (data.connect ?? {}) as { method?: unknown; message?: unknown };
    if (connect.method === "desktop") return { method: "desktop", message: typeof connect.message === "string" ? connect.message : "" };
    return { method: "redirect" };
  }

  /** Asks whether an earlier send with this request id arrived. Never starts anything. */
  recoverSend(requestId: string): Promise<SendOutcome> {
    return this.send({ requestId, recoverOnly: true }, true);
  }

  /** GET /api/web/changes/<request id> — the change's live progress, or null when PawOS has no record of it yet. */
  async getChange(requestId: string): Promise<CodeChange | null> {
    const answer = await this.request("GET", `/api/web/changes/${encodeURIComponent(requestId)}`);
    if (answer.status === 404) return null;
    if (answer.status < 200 || answer.status >= 300 || answer.data.ok !== true) throw failure(answer.status, answer.data);
    return (answer.data.change ?? null) as CodeChange | null;
  }
}
