import type { AccountContext } from "../account/accountContext";
import { isIntegrationEntitled } from "../account/integrations";
import { ToolError, runConnectedTool } from "../connectedTools/tools";
import { isLinearIssueRef } from "../connectedTools/linear";
import { isRepositoryName, githubClientFor } from "../webCode/github";
import { requireWebCapability } from "../webPolicy/webCapabilities";

/**
 * Autonomous Work from the PawOS CLI: resolve one GitHub or Linear ticket on the user's own computer.
 *
 * The billing is the desktop's, unchanged — the same Supabase functions under the user's own
 * session, with the same guarantees (they are the only path to a charge):
 *   start_or_get_active_autonomous_task_run   one active run per ticket (a retry of a failed run is charged its retry fee there)
 *   transition_autonomous_task_run            queued → running
 *   mark_autonomous_task_completed            the ticket price, by change size, charged exactly once
 *   mark_autonomous_task_terminal             failed / cancelled (the run's own fee rules apply)
 *
 * What this module adds is the server-side gate the desktop runs before any of them
 * (AutonomousTaskBillingGate.ts): the plan holds Autonomous Work (`web.localAutonomousWork` — the
 * desktop's 'autonomousTaskBilling' tiers), the ticket's tracker is on the plan and connected, and
 * the Ticket Balance has the start minimum. The user's authorization is asked for by the client
 * (with the balance and the price rule shown) and a start without `authorized: true` is refused.
 *
 * Completion evidence: a pull request URL is checked on GitHub (pr_verified) and a write-back
 * comment posted here through connected tools marks the ticket updated (ticket_verified); anything
 * else is recorded as self-reported, exactly as the desktop records it.
 */

/** pawos_ticket_start_minimum() — the desktop's TICKET_START_MINIMUM_USD. */
export const TICKET_START_MINIMUM_USD = 5;
export const RUNTIME_VERSION = "pawos-cli-autonomous/1";

export type TicketRef = { source: "linear"; id: string } | { source: "github"; repo: string; number: number };

export class AutonomousError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** "ENG-123", "linear:ENG-123", "owner/repo#12" or a GitHub issue URL. */
export function parseTicketRef(raw: unknown): TicketRef | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  const linear = /^(?:linear:)?([A-Za-z][A-Za-z0-9]{0,9}-\d{1,7})$/i.exec(text);
  if (linear && isLinearIssueRef(linear[1])) return { source: "linear", id: (linear[1] ?? "").toUpperCase() };
  const short = /^(?:github:)?([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#(\d{1,7})$/.exec(text);
  const url = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})\/issues\/(\d{1,7})\/?$/.exec(text);
  const match = short ?? url;
  if (match && isRepositoryName(match[1])) return { source: "github", repo: match[1] ?? "", number: Number(match[2]) };
  return null;
}

export function ticketKey(ref: TicketRef): string {
  return ref.source === "linear" ? ref.id : `${ref.repo}#${ref.number}`;
}

export interface TicketView {
  source: "linear" | "github";
  key: string;
  title: string;
  description: string;
  url: string | null;
  status: string | null;
}

async function readTicket(account: AccountContext, ref: TicketRef): Promise<TicketView> {
  if (ref.source === "linear") {
    const { data } = await runConnectedTool(account, { tool: "linear.issue", args: { id: ref.id } });
    const issue = (data as { issue: { key: string; title: string; description: string; url: string | null; status: string | null } }).issue;
    return { source: "linear", key: issue.key, title: issue.title, description: issue.description, url: issue.url, status: issue.status };
  }
  const { data } = await runConnectedTool(account, { tool: "github.issue", args: { repo: ref.repo, number: ref.number } });
  const issue = (data as { issue: { number: number; title: string; body: string; url: string; state: string; isPullRequest: boolean } }).issue;
  if (issue.isPullRequest) throw new AutonomousError("not_a_ticket", `${ticketKey(ref)} is a pull request, not an issue.`, 422);
  return { source: "github", key: ticketKey(ref), title: issue.title, description: issue.body, url: issue.url, status: issue.state };
}

export interface TicketBalance {
  balanceUsd: number;
  availableUsd: number;
}

async function readBalance(account: AccountContext, organizationId: string | null): Promise<TicketBalance> {
  const query = organizationId
    ? account.supabase.from("organization_task_credits").select("balance_usd, balance_pc, balance_reserved").eq("organization_id", organizationId).maybeSingle()
    : account.supabase.from("user_task_credits").select("balance_usd, balance_pc, balance_reserved").eq("user_id", account.user.id).maybeSingle();
  const { data, error } = await query;
  if (error) throw new AutonomousError("unavailable", "PawOS couldn't read your Ticket Balance. Please try again.", 503);
  const row = (data ?? {}) as { balance_usd?: number | null; balance_pc?: number | null; balance_reserved?: number | null };
  return { balanceUsd: Number(row.balance_usd ?? 0), availableUsd: (Number(row.balance_pc ?? 0) - Number(row.balance_reserved ?? 0)) / 100 };
}

function organizationArg(account: AccountContext, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !account.organizations.some((org) => org.id === raw)) throw new AutonomousError("forbidden", "You aren't an active member of that organization.", 403);
  return raw;
}

/**
 * Everything checked before a run may start — the desktop gate's order: plan, tracker, balance.
 * Throws AutonomousError/ToolError with what is missing.
 */
async function gate(account: AccountContext, ref: TicketRef, organizationId: string | null): Promise<{ ticket: TicketView; balance: TicketBalance }> {
  requireWebCapability(account, "web.localAutonomousWork");
  if (!isIntegrationEntitled(account, ref.source)) throw new AutonomousError("not_entitled", `${ref.source === "github" ? "GitHub" : "Linear"} isn't included in your plan.`, 403);
  // Reading the ticket proves the tracker is connected and the ticket exists (the desktop's "never
  // start a ticket it can't read" rule).
  const ticket = await readTicket(account, ref);
  const balance = await readBalance(account, organizationId);
  return { ticket, balance };
}

function balanceProblem(balance: TicketBalance, organizationId: string | null): string | null {
  const whose = organizationId ? "This organization's Ticket Balance" : "Your Ticket Balance";
  if (balance.balanceUsd < 0) return `${whose} is -$${Math.abs(balance.balanceUsd).toFixed(2)} (owed from a previous ticket). Add funds in PawOS (Settings, Billing) before starting a new ticket.`;
  if (balance.availableUsd < TICKET_START_MINIMUM_USD) return `${whose} has $${Math.max(balance.availableUsd, 0).toFixed(2)} available; a ticket needs at least $${TICKET_START_MINIMUM_USD.toFixed(2)} to start. Add funds in PawOS (Settings, Billing).`;
  return null;
}

export const PRICE_RULE = `The ticket is charged when it is completed, by the size of the change (from $${TICKET_START_MINIMUM_USD.toFixed(2)}); a failed run costs nothing, and a cancelled or retried run follows the Ticket Balance fee rules shown in PawOS.`;

export async function previewAutonomousWork(account: AccountContext, body: Record<string, unknown>) {
  const ref = parseTicketRef(body.ticket);
  if (!ref) throw new AutonomousError("invalid_ticket", "Give the ticket as a Linear key (ENG-123) or a GitHub issue (owner/repo#12).", 400);
  const organizationId = organizationArg(account, body.organizationId);
  const { ticket, balance } = await gate(account, ref, organizationId);
  const blocked = balanceProblem(balance, organizationId);
  return { ticket, balance, minimumUsd: TICKET_START_MINIMUM_USD, priceRule: PRICE_RULE, canStart: blocked === null, blocked };
}

type RunRow = { id: string; status: string; ticket_id: string | null; started_at: string | null; attempt_number?: number | null };

export async function startAutonomousWork(account: AccountContext, body: Record<string, unknown>) {
  const ref = parseTicketRef(body.ticket);
  if (!ref) throw new AutonomousError("invalid_ticket", "Give the ticket as a Linear key (ENG-123) or a GitHub issue (owner/repo#12).", 400);
  if (body.authorized !== true) throw new AutonomousError("authorization_required", "Autonomous Work is paid from your Ticket Balance. Show the price to the user and start it only with their authorization.", 428);
  const organizationId = organizationArg(account, body.organizationId);
  const repository = body.repository === undefined || body.repository === null || body.repository === "" ? null : isRepositoryName(body.repository) ? body.repository : null;
  if (body.repository && !repository) throw new AutonomousError("invalid_repository", "Give the repository as owner/name.", 400);
  const { ticket, balance } = await gate(account, ref, organizationId);
  const blocked = balanceProblem(balance, organizationId);
  if (blocked) throw new AutonomousError("balance_required", blocked, 402, { balance });

  const { data, error } = await account.supabase
    .rpc("start_or_get_active_autonomous_task_run", {
      p_organization_id: organizationId,
      p_workspace_id: null,
      p_ticket_source: ref.source,
      p_ticket_id: ticketKey(ref),
      p_repository: repository ?? (ref.source === "github" ? ref.repo : null),
      p_runtime_version: RUNTIME_VERSION,
    });
  // A set-returning function: one row of { run_row, already_active }.
  const result = (Array.isArray(data) ? data[0] : data) as { run_row: RunRow; already_active: boolean } | null | undefined;
  if (error || !result?.run_row?.id) throw new AutonomousError("unavailable", "PawOS couldn't start the run. Nothing was charged. Please try again.", 503);
  const run = result.run_row;
  if (result.already_active) {
    return { run: { id: run.id, status: run.status }, alreadyActive: true, ticket, message: `A run for ${ticket.key} is already in progress (status ${run.status}). Finish or end it before starting another.` };
  }
  const moved = await account.supabase.rpc("transition_autonomous_task_run", { p_run_id: run.id, p_to_status: "running", p_reason: "Started from the PawOS CLI" });
  if (moved.error) {
    await account.supabase.rpc("mark_autonomous_task_terminal", { p_run_id: run.id, p_status: "failed" });
    throw new AutonomousError("unavailable", "PawOS couldn't start the run. It was ended without a charge. Please try again.", 503);
  }
  return { run: { id: run.id, status: "running", attempt: run.attempt_number ?? 1 }, alreadyActive: false, ticket, balance, priceRule: PRICE_RULE };
}

async function ownRun(account: AccountContext, runId: unknown): Promise<RunRow & { ticket_source: string | null; repository: string | null }> {
  if (typeof runId !== "string" || !/^[0-9a-f-]{36}$/i.test(runId)) throw new AutonomousError("invalid_run", "That isn't a run id.", 400);
  // RLS limits this to runs the signed-in account may see.
  const { data, error } = await account.supabase.from("autonomous_task_runs").select("id, status, ticket_id, ticket_source, repository, started_at, user_id").eq("id", runId).maybeSingle();
  if (error || !data) throw new AutonomousError("not_found", "PawOS has no run like that for this account.", 404);
  const row = data as RunRow & { ticket_source: string | null; repository: string | null; user_id: string | null };
  if (row.user_id !== account.user.id) throw new AutonomousError("not_found", "PawOS has no run like that for this account.", 404);
  return row;
}

function count(raw: unknown, name: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 1_000_000) throw new AutonomousError("invalid_evidence", `${name} must be a whole number.`, 400);
  return raw;
}

/** A pull request URL on github.com, and whether it really exists (checked with the account's GitHub connection). */
async function verifyPullRequest(account: AccountContext, prUrl: string): Promise<boolean> {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})\/pull\/(\d{1,7})\/?$/.exec(prUrl);
  if (!match || !isRepositoryName(match[1])) return false;
  try {
    const github = await githubClientFor(account);
    const pull = await github.get<{ html_url?: string }>(`/repos/${match[1]}/pulls/${match[2]}`);
    return Boolean(pull?.html_url);
  } catch {
    return false;
  }
}

export async function finishAutonomousWork(account: AccountContext, runId: unknown, body: Record<string, unknown>) {
  requireWebCapability(account, "web.localAutonomousWork");
  const run = await ownRun(account, runId);
  const outcome = body.outcome;
  if (outcome === "failed" || outcome === "cancelled") {
    const { error } = await account.supabase.rpc("mark_autonomous_task_terminal", { p_run_id: run.id, p_status: outcome });
    if (error) throw new AutonomousError("unavailable", "PawOS couldn't record how the run ended. Please try again.", 503);
    return { run: { id: run.id, status: outcome }, charged: outcome === "cancelled" ? "cancellation fee rules apply" : "nothing" };
  }
  if (outcome !== "completed") throw new AutonomousError("invalid_outcome", "outcome is completed, failed or cancelled.", 400);

  const filesChanged = count(body.filesChanged, "filesChanged");
  const linesChanged = count(body.linesChanged, "linesChanged");
  if (filesChanged === 0) throw new AutonomousError("no_change", "A run with no file changes can't be completed as a resolved ticket. End it as failed or cancelled instead.", 422);
  const prUrl = typeof body.prUrl === "string" && body.prUrl.trim() ? body.prUrl.trim() : null;
  const prVerified = prUrl ? await verifyPullRequest(account, prUrl) : false;
  if (prUrl && !prVerified) throw new AutonomousError("pr_not_found", "That pull request couldn't be found on GitHub with your connection. Check the link, or complete without it.", 422);

  // Write-back: a comment on the ticket, posted through connected tools (a write: the user confirmed it).
  let ticketVerified = false;
  let commentUrl: string | null = null;
  if (typeof body.comment === "string" && body.comment.trim()) {
    if (body.commentConfirmed !== true) throw new ToolError("confirmation_required", "Posting the comment changes the ticket. Ask the user, then send it again with commentConfirmed: true.", 428);
    const ref = parseTicketRef(run.ticket_id ?? "");
    if (!ref) throw new AutonomousError("invalid_ticket", "This run has no ticket to comment on.", 422);
    const posted =
      ref.source === "linear"
        ? await runConnectedTool(account, { tool: "linear.comment", args: { id: ref.id, body: body.comment }, confirmed: true })
        : await runConnectedTool(account, { tool: "github.comment", args: { repo: ref.repo, number: ref.number, body: body.comment }, confirmed: true });
    ticketVerified = true;
    commentUrl = ((posted.data as { url?: string | null }).url ?? null) as string | null;
  }

  const { data, error } = await account.supabase.rpc("mark_autonomous_task_completed", {
    p_run_id: run.id,
    p_pr_url: prUrl,
    p_client_reply_sent: false,
    p_deploy_completed: false,
    p_invoice_reference: null,
    p_pr_verified: prVerified,
    p_ticket_verified: ticketVerified,
    p_files_changed: filesChanged,
    p_lines_changed: linesChanged,
  });
  if (error) throw new AutonomousError("unavailable", "PawOS couldn't complete the run. Nothing was charged. Please try again.", 503);
  const billingEventId = typeof data === "string" ? data : null;
  const { data: event } = billingEventId ? await account.supabase.from("organization_billing_events").select("amount_usd").eq("id", billingEventId).maybeSingle() : { data: null };
  return {
    run: { id: run.id, status: "completed" },
    chargedUsd: event && typeof (event as { amount_usd?: unknown }).amount_usd === "number" ? (event as { amount_usd: number }).amount_usd : null,
    prVerified,
    ticketVerified,
    commentUrl,
  };
}
