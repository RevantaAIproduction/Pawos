import type { AccountContext } from "../account/accountContext";

/**
 * PawOS Web's server-side Linear client, for connected tools.
 *
 * The token is the account's existing Linear connector credential — the same row the desktop app's
 * Linear connector writes — read on the server through read_connectivity_credential() under the
 * user's own session, so row-level security and Vault decide whose token it is. It never leaves
 * the server: not returned, not logged, not put in a URL.
 *
 * The queries are the desktop's (src/main/infrastructure/connectors/projectManagement/
 * LinearConnector.ts and LinearWriteBackPlugin.ts): the same fields, the same issue lookup by key.
 * The desktop refreshes an expired OAuth token itself; the server holds no Linear client secret, so
 * an expired token is reported as "reconnect Linear" rather than refreshed here.
 */

const LINEAR_API = "https://api.linear.app/graphql";

function apiUrl(): string {
  const override = process.env.WEB_LINEAR_API_URL;
  return override && process.env.NODE_ENV !== "production" ? override : LINEAR_API;
}

export type LinearFailure = "not_connected" | "needs_reauth" | "not_found" | "no_access" | "unavailable";

export class LinearError extends Error {
  constructor(
    readonly code: LinearFailure,
    message: string
  ) {
    super(message);
  }
}

/** A personal API key goes in the header as it is; an OAuth token as a bearer token (as on the desktop). */
function authorization(token: string): string {
  return token.startsWith("lin_api_") ? token : `Bearer ${token}`;
}

export interface LinearIssue {
  id: string;
  key: string;
  title: string;
  description: string;
  url: string | null;
  status: string | null;
  priority: string | null;
  labels: string[];
  assignee: string | null;
  reporter: string | null;
  dueDate: string | null;
}

type IssueNode = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string | null;
  state: { name: string } | null;
  labels: { nodes: { name: string }[] } | null;
  priorityLabel?: string | null;
  dueDate?: string | null;
  assignee?: { name: string } | null;
  creator?: { name: string } | null;
};

const ISSUE_FIELDS = "id identifier title description url state { name } labels { nodes { name } } priorityLabel dueDate assignee { name } creator { name }";

function toIssue(node: IssueNode): LinearIssue {
  return {
    id: node.id,
    key: node.identifier,
    title: node.title,
    description: node.description ?? "",
    url: node.url ?? null,
    status: node.state?.name ?? null,
    priority: node.priorityLabel && node.priorityLabel !== "No priority" ? node.priorityLabel : null,
    labels: node.labels?.nodes?.map((label) => label.name) ?? [],
    assignee: node.assignee?.name ?? null,
    reporter: node.creator?.name ?? null,
    dueDate: node.dueDate ?? null,
  };
}

/** A Linear issue key (ENG-123) or Linear's own id (a UUID). */
export function isLinearIssueRef(value: unknown): value is string {
  return typeof value === "string" && (/^[A-Za-z][A-Za-z0-9]{0,9}-\d{1,7}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

/** Whether the account has a usable Linear connection — the connection row only; no token is read. */
async function connectionState(account: AccountContext): Promise<"connected" | "needsReauth" | "notConnected"> {
  const { data, error } = await account.supabase.from("connectivity_connections").select("status").eq("user_id", account.user.id).eq("connector_id", "linear").is("organization_id", null).maybeSingle();
  if (error || !data) return "notConnected";
  const status = (data as { status?: string }).status;
  return status === "connected" ? "connected" : status === "needsReauth" || status === "error" ? "needsReauth" : "notConnected";
}

export async function linearClientFor(account: AccountContext): Promise<LinearClient> {
  const state = await connectionState(account);
  if (state === "notConnected") throw new LinearError("not_connected", "Connect Linear to use it from PawOS.");
  if (state === "needsReauth") throw new LinearError("needs_reauth", "Reconnect Linear to use it from PawOS.");
  const { data, error } = await account.supabase.rpc("read_connectivity_credential", { p_connector_id: "linear", p_organization_id: null });
  const row = (Array.isArray(data) ? data[0] : data) as { secret?: string | null; expires_at?: string | null } | null;
  if (error || !row?.secret) throw new LinearError("not_connected", "Connect Linear to use it from PawOS.");
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw new LinearError("needs_reauth", "Your Linear connection has expired. Reconnect Linear (or open PawOS Desktop, which renews it) and try again.");
  return new LinearClient(row.secret);
}

export class LinearClient {
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  private async query<T>(gql: string, variables: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(apiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization(this.#token) },
        body: JSON.stringify({ query: gql, variables }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new LinearError("unavailable", "Linear couldn't be reached. Please try again.");
    }
    if (response.status === 401) throw new LinearError("needs_reauth", "Linear didn't accept the connection. Reconnect Linear and try again.");
    if (response.status === 403) throw new LinearError("no_access", "Your Linear connection doesn't have access to do that.");
    if (!response.ok) throw new LinearError("unavailable", "Linear couldn't complete that. Please try again.");
    const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] } | null;
    if (!body) throw new LinearError("unavailable", "Linear sent an answer PawOS couldn't read.");
    if (body.errors?.length) {
      const notFound = body.errors.some((e) => /not found|entity not found/i.test(e.message ?? "") || e.extensions?.code === "ENTITY_NOT_FOUND");
      if (notFound) throw new LinearError("not_found", "Linear has no issue like that.");
      const denied = body.errors.some((e) => /forbidden|not authorized|permission/i.test(e.message ?? ""));
      throw denied ? new LinearError("no_access", "Your Linear connection doesn't have access to do that.") : new LinearError("unavailable", "Linear couldn't complete that. Please try again.");
    }
    if (body.data === undefined) throw new LinearError("unavailable", "Linear sent an answer PawOS couldn't read.");
    return body.data;
  }

  /** Issues assigned to the connected Linear user (Linear's own `viewer`, never a guessed id). */
  async myIssues(limit: number): Promise<LinearIssue[]> {
    const data = await this.query<{ viewer: { assignedIssues: { nodes: IssueNode[] } } }>(`query($first: Int!) { viewer { assignedIssues(first: $first, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } } } }`, { first: limit });
    return data.viewer.assignedIssues.nodes.map(toIssue);
  }

  async issue(ref: string): Promise<LinearIssue> {
    const data = await this.query<{ issue: IssueNode | null }>(`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id: ref });
    if (!data.issue) throw new LinearError("not_found", `Linear has no issue ${ref}.`);
    return toIssue(data.issue);
  }

  async search(term: string, limit: number): Promise<LinearIssue[]> {
    const data = await this.query<{ issueSearch: { nodes: IssueNode[] } }>(`query($term: String!, $first: Int!) { issueSearch(query: $term, first: $first) { nodes { ${ISSUE_FIELDS} } } }`, { term, first: limit });
    return data.issueSearch.nodes.map(toIssue);
  }

  /** Comments on an issue. Linear's commentCreate takes its own id, so the key is resolved first. */
  async comment(ref: string, body: string): Promise<{ id: string; url: string | null }> {
    const issue = await this.issue(ref);
    const data = await this.query<{ commentCreate: { success: boolean; comment: { id: string; url?: string | null } | null } }>(
      "mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id url } } }",
      { issueId: issue.id, body }
    );
    if (!data.commentCreate?.success || !data.commentCreate.comment) throw new LinearError("unavailable", "Linear didn't add the comment.");
    return { id: data.commentCreate.comment.id, url: data.commentCreate.comment.url ?? null };
  }
}
