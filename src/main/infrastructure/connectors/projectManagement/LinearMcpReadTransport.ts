import type { InfraTicket } from '../../../../shared/infrastructure/InfrastructureTypes';
import { McpError, McpReadClient, type McpFailureKind, type McpTool } from '../../../connectivity/mcp/McpReadClient';

/**
 * Read-only transport to Linear's Remote MCP server, used by LinearConnector.listMyTickets() ahead
 * of its GraphQL query. The protocol itself lives in the shared McpReadClient; this file holds
 * what is Linear-specific: the endpoint, the read-tool allowlist and the result mapping.
 *
 * Safety rules this file enforces:
 *  - Only the read-only endpoint below is ever contacted; the read-write endpoint is not referenced.
 *  - Only a tool named in LINEAR_MCP_READ_TOOL_ALLOWLIST is ever called, and only if the server
 *    lists it. A tool the server marks as non-read-only or destructive is never called.
 *  - Everything the server returns (tool names, descriptions, schemas, results) is untrusted
 *    external data. Tool descriptions are never read. Results are copied field by field into
 *    InfraTicket after type checks; nothing from the server is interpreted as an instruction.
 *  - The access token is sent only in the Authorization header and is never logged.
 */

export const LINEAR_MCP_READONLY_ENDPOINT = 'https://mcp.linear.app/mcp/readonly';

/** In preference order. `list_issues` is only used when its schema accepts an `assignee` filter. */
export const LINEAR_MCP_READ_TOOL_ALLOWLIST: readonly string[] = ['list_my_issues', 'list_issues'];

const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const MAX_ISSUES = 50;
const MAX_DESCRIPTION_CHARS = 20_000;
const MAX_FIELD_CHARS = 500;

export type LinearMcpFailureKind = McpFailureKind;

/** The shared MCP error type under its original Linear name (existing callers and tests use it). */
export const LinearMcpError = McpError;
export type LinearMcpError = McpError;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** A display name from either a plain string or an object carrying `name`/`displayName`. */
function nameOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() ? clip(value.trim(), MAX_FIELD_CHARS) : undefined;
  if (isObject(value)) return nameOf(value.name) ?? nameOf(value.displayName);
  return undefined;
}

const PRIORITY_BY_NUMBER: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };

function priorityOf(value: unknown): string | undefined {
  if (typeof value === 'number') return PRIORITY_BY_NUMBER[value];
  if (isObject(value)) return priorityOf(value.name ?? value.label ?? value.value);
  const label = nameOf(value);
  return label && label.toLowerCase() !== 'no priority' ? label : undefined;
}

function labelsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return list.map(nameOf).filter((label): label is string => Boolean(label));
}

/** One MCP issue → InfraTicket, or null when it lacks what every ticket consumer relies on. */
function toTicket(raw: unknown): InfraTicket | null {
  if (!isObject(raw)) return null;
  const id = typeof raw.identifier === 'string' ? raw.identifier : typeof raw.id === 'string' ? raw.id : '';
  // PawOS addresses Linear issues by their ENG-123 identifier everywhere else (getTicket, write-back).
  if (!/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(id)) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  const url = typeof raw.url === 'string' && raw.url.startsWith('https://linear.app/') ? clip(raw.url, 2000) : undefined;
  const dueDate = typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.dueDate) ? raw.dueDate : undefined;
  return {
    id,
    title: clip(raw.title, MAX_FIELD_CHARS),
    description: typeof raw.description === 'string' ? clip(raw.description, MAX_DESCRIPTION_CHARS) : '',
    url,
    status: nameOf(raw.status) ?? nameOf(raw.state),
    labels: labelsOf(raw.labels),
    priority: priorityOf(raw.priorityLabel ?? raw.priority),
    dueDate,
    assignee: nameOf(raw.assignee),
    reporter: nameOf(raw.creator) ?? nameOf(raw.createdBy),
  };
}

/** Exported for tests: the `tools/call` result → tickets, or a 'malformed' LinearMcpError. */
export function mapLinearMcpIssues(result: unknown): InfraTicket[] {
  if (!isObject(result)) throw new LinearMcpError('malformed', 'tools/call returned no result object.');
  if (result.isError === true) throw new LinearMcpError('unavailable', 'The Linear MCP tool reported an error.');

  let payload: unknown = result.structuredContent;
  if (payload === undefined) {
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.find((part): part is JsonObject => isObject(part) && part.type === 'text' && typeof part.text === 'string');
    if (!text) throw new LinearMcpError('malformed', 'tools/call returned no text or structured content.');
    try {
      payload = JSON.parse(text.text as string);
    } catch {
      throw new LinearMcpError('malformed', 'tools/call text content was not JSON.');
    }
  }

  const list = Array.isArray(payload)
    ? payload
    : isObject(payload)
      ? [payload.issues, payload.nodes, payload.items, payload.results].find(Array.isArray)
      : undefined;
  if (!Array.isArray(list)) throw new LinearMcpError('malformed', 'tools/call result contained no issue list.');

  const tickets = list.map(toTicket);
  // All-or-nothing: silently dropping an issue that failed to map would under-report what is
  // assigned, so one bad item sends the whole request to the GraphQL fallback instead.
  if (tickets.some((ticket) => ticket === null)) throw new LinearMcpError('malformed', 'An issue in the MCP result could not be mapped.');
  return tickets as InfraTicket[];
}

interface ChosenTool {
  token: string;
  name: string;
  args: JsonObject;
}

/** Picks the allowlisted read tool for "issues assigned to me" from the server's tool list. */
function pickAssignedIssuesTool(tools: McpTool[]): { name: string; args: JsonObject } {
  for (const name of LINEAR_MCP_READ_TOOL_ALLOWLIST) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) continue;
    if (tool.readOnlyHint === false || tool.destructiveHint === true) continue;
    const args: JsonObject = {};
    if (name === 'list_issues') {
      // Without a server-side assignee filter this tool would list other people's issues.
      if (!tool.inputProperties.includes('assignee')) continue;
      args.assignee = 'me';
    }
    if (tool.inputProperties.includes('limit')) args.limit = MAX_ISSUES;
    return { name, args };
  }
  throw new LinearMcpError('no-read-tool', 'Linear MCP lists no allowlisted tool for assigned issues.');
}

export class LinearMcpReadTransport {
  private readonly client = new McpReadClient(LINEAR_MCP_READONLY_ENDPOINT, 'Linear MCP');
  private chosen: ChosenTool | undefined;
  /** After a failure, MCP is skipped (GraphQL serves the request) instead of failing every call:
   *  a rejected token stays skipped until the token changes, anything else for a few minutes. */
  private skip: { token?: string; until: number; kind: LinearMcpFailureKind } | undefined;

  /** Forgets the session and any skip state — called when Linear is disconnected. */
  reset(): void {
    this.client.dropSession();
    this.chosen = undefined;
    this.skip = undefined;
  }

  private async callAssignedIssuesTool(token: string): Promise<InfraTicket[]> {
    if (this.chosen?.token !== token || !this.client.hasOpenSession(token)) {
      const picked = pickAssignedIssuesTool(await this.client.listTools(token));
      this.chosen = { token, ...picked };
      console.info(`[linear-mcp] read-only session open; assigned issues are read with '${picked.name}'.`);
    }
    // Defence in depth: the name was chosen from the allowlist, and is checked against it again here.
    if (!LINEAR_MCP_READ_TOOL_ALLOWLIST.includes(this.chosen.name)) {
      throw new LinearMcpError('no-read-tool', 'Refusing to call a Linear MCP tool that is not allowlisted.');
    }
    return mapLinearMcpIssues(await this.client.callTool(token, this.chosen.name, this.chosen.args));
  }

  /**
   * Issues assigned to the account the token belongs to. Throws LinearMcpError on any failure —
   * the caller (LinearConnector) falls back to GraphQL. Never mutates anything in Linear.
   */
  async listMyIssues(token: string): Promise<InfraTicket[]> {
    if (!token) throw new LinearMcpError('unauthorized', 'No Linear access token.');
    const skip = this.skip;
    if (skip && Date.now() < skip.until && (skip.kind !== 'unauthorized' || skip.token === token)) {
      throw new LinearMcpError(skip.kind, 'Linear MCP is temporarily skipped after an earlier failure.');
    }
    try {
      let tickets: InfraTicket[];
      const hadSession = this.client.hasOpenSession(token) && this.chosen?.token === token;
      try {
        tickets = await this.callAssignedIssuesTool(token);
      } catch (error) {
        // A cached session the server has since dropped: open a new one and try once more.
        if (!(error instanceof LinearMcpError) || error.kind !== 'unavailable' || !hadSession) throw error;
        this.client.dropSession();
        this.chosen = undefined;
        tickets = await this.callAssignedIssuesTool(token);
      }
      if (this.skip) console.info('[linear-mcp] read-only MCP is serving assigned issues again.');
      this.skip = undefined;
      return tickets;
    } catch (error) {
      const failure = error instanceof LinearMcpError ? error : new LinearMcpError('unavailable', 'Unexpected Linear MCP failure.');
      this.client.dropSession();
      this.chosen = undefined;
      this.skip = {
        kind: failure.kind,
        token: failure.kind === 'unauthorized' ? token : undefined,
        until: failure.kind === 'unauthorized' ? Number.POSITIVE_INFINITY : Date.now() + RETRY_AFTER_FAILURE_MS,
      };
      console.warn(`[linear-mcp] ${failure.kind}: ${failure.message} Using the Linear GraphQL API instead.`);
      throw failure;
    }
  }
}
