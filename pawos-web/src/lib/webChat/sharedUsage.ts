import type { AccountContext } from "../account/accountContext";
import { createServiceClient } from "../supabase/serviceClient";
import { WEB_POLICY } from "../webPolicy/webCapabilities";
import { WebChatError } from "./errors";
import { WEB_MODEL, type ModelUsage } from "./model";

/**
 * The parts of a Web message's usage that are counted where PawOS Desktop counts them, for the
 * plans whose usage does not live in the account's usage buckets (see webUsageSourceFor()).
 */

/** The capability Desktop counts a conversation turn under in the organization pool. */
export const ORGANIZATION_TURN_CAPABILITY = "aiReasoning";

/**
 * Enterprise: takes one unit of the organization's shared monthly pool for this message,
 * through the same function PawOS Desktop calls before each turn (increment_organization_usage, as
 * the signed-in user — it checks membership and the limit itself, atomically). Refused → the
 * message is not answered.
 */
export async function takeOrganizationTurn(account: AccountContext): Promise<void> {
  const organization = account.organizations.find((org) => org.tier === account.tier) ?? account.organizations[0];
  if (!organization) throw new WebChatError("usage_limit_reached", "Your organization's usage couldn't be checked. Please try again.", 503);
  const { error } = await account.supabase.rpc("increment_organization_usage", {
    p_organization_id: organization.id,
    p_capability: ORGANIZATION_TURN_CAPABILITY,
    p_amount: 1,
  });
  if (!error) return;
  if ((error.message ?? "").includes("usage limit exceeded")) {
    throw new WebChatError("usage_limit_reached", "Your organization's shared usage for this month has been used. It resets at the start of next month — ask your organization's owner about more.", 402);
  }
  console.error("[web-chat] could not count organization usage:", error.code ?? "unknown");
  throw new WebChatError("usage_limit_reached", "Your organization's usage couldn't be checked. Please try again.", 503);
}

type BuildReport = {
  weekPcUsed?: unknown;
  weekPcLimit?: unknown;
  windowPcUsed?: unknown;
  windowPcLimit?: unknown;
  weekResetsAt?: unknown;
  windowResetsAt?: unknown;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The start of the admin-granted tier's current week: weeks are anchored to the grant's start, as
 * PawOS Desktop anchors them (a grant's last week runs to its end). Without a start, a rolling week.
 */
export function buildWeekStart(startsAt: number | null, endsAt: number | null, now: number): number {
  if (startsAt === null || now < startsAt) return now - WEEK_MS;
  let week = Math.floor((now - startsAt) / WEEK_MS);
  if (endsAt !== null) week = Math.min(week, Math.max(0, Math.floor((endsAt - startsAt) / WEEK_MS) - 1));
  return startsAt + week * WEEK_MS;
}

/** What PawOS Desktop last reported for the current week and 5-hour window (0 once they have reset). */
export function reportedUsage(report: BuildReport | null, now: number): { weekPc: number; windowPc: number } {
  if (!report) return { weekPc: 0, windowPc: 0 };
  const weekResets = num(report.weekResetsAt);
  const windowResets = num(report.windowResetsAt);
  return {
    weekPc: weekResets !== null && weekResets > now ? (num(report.weekPcUsed) ?? 0) : 0,
    windowPc: windowResets !== null && windowResets > now ? (num(report.windowPcUsed) ?? 0) : 0,
  };
}

/**
 * Customer Paw Compute for one model call: the provider-reported tokens priced at the model's
 * current price (USD per million tokens), at PawOS's customer rate — $1 of model cost = 300 PC
 * (100 PC per $1, ×3), the rate PawOS Desktop meters this tier with.
 */
export const CUSTOMER_PC_PER_MODEL_USD = 300;
export type ModelPrice = { input_usd_per_mtok: number; cached_input_usd_per_mtok: number; output_usd_per_mtok: number };
export function pcForCall(usage: ModelUsage, price: ModelPrice): number {
  const cached = Math.min(usage.cachedTokens, usage.promptTokens);
  const usd =
    ((usage.promptTokens - cached) * Number(price.input_usd_per_mtok) +
      cached * Number(price.cached_input_usd_per_mtok) +
      (usage.candidatesTokens + usage.thoughtsTokens) * Number(price.output_usd_per_mtok)) /
    1_000_000;
  return Math.round(usd * CUSTOMER_PC_PER_MODEL_USD * 10_000) / 10_000;
}

async function currentPrice(): Promise<ModelPrice | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await createServiceClient()
    .from("model_prices")
    .select("input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok, effective_from, effective_until, version")
    .eq("model", WEB_MODEL)
    .eq("active", true);
  if (error) return null;
  const rows = ((data ?? []) as (ModelPrice & { effective_from: string; effective_until: string | null; version: number })[])
    .filter((row) => row.effective_from <= nowIso && (row.effective_until === null || row.effective_until > nowIso))
    .sort((a, b) => b.version - a.version);
  return rows[0] ?? null;
}

/**
 * The admin-granted access tier: refuses the message when the tier's included Paw Compute is used
 * up — PawOS Desktop's latest report plus what PawOS Web has used — so Web messages come out of the
 * same weekly and 5-hour limits instead of adding to them.
 */
export async function requireBuildAllowance(account: AccountContext, now = Date.now()): Promise<void> {
  const service = createServiceClient();
  const [access, reportRow] = await Promise.all([
    account.supabase.rpc("get_my_build_access"),
    service.from("pawos_build_usage_reports").select("report").eq("user_id", account.user.id).maybeSingle(),
  ]);
  const grant = (access.data ?? {}) as { startsAt?: string | null; endsAt?: string | null };
  const startsAt = grant.startsAt ? Date.parse(grant.startsAt) : null;
  const endsAt = grant.endsAt ? Date.parse(grant.endsAt) : null;
  const weekStart = buildWeekStart(Number.isFinite(startsAt) ? startsAt : null, Number.isFinite(endsAt) ? endsAt : null, now);
  const windowStart = now - WEB_POLICY.adminTierWindowHours * 60 * 60 * 1000;

  const web = await service.from("web_build_usage").select("pc, created_at").eq("user_id", account.user.id).gte("created_at", new Date(Math.min(weekStart, windowStart)).toISOString());
  if (web.error) throw new WebChatError("usage_limit_reached", "Your usage couldn't be checked. Please try again.", 503);
  let webWeek = 0;
  let webWindow = 0;
  for (const row of (web.data ?? []) as { pc: number | string; created_at: string }[]) {
    const at = Date.parse(row.created_at);
    if (at >= weekStart) webWeek += Number(row.pc);
    if (at >= windowStart) webWindow += Number(row.pc);
  }
  const desktop = reportedUsage(((reportRow.data as { report?: BuildReport } | null)?.report ?? null) as BuildReport | null, now);

  if (desktop.weekPc + webWeek >= WEB_POLICY.adminTierWeeklyPc) {
    throw new WebChatError("usage_limit_reached", "This week's included Paw Compute has been used (PawOS Desktop and Web together). It resets at your weekly reset.", 402);
  }
  if (desktop.windowPc + webWindow >= WEB_POLICY.adminTierWindowPc) {
    throw new WebChatError("usage_limit_reached", "The Paw Compute for this 5-hour window has been used (PawOS Desktop and Web together). Try again later.", 402);
  }
}

/** Records the Paw Compute one Web model call used on the admin-granted access tier. */
export async function recordBuildUsage(account: AccountContext, requestKey: string, usage: ModelUsage): Promise<void> {
  const price = await currentPrice();
  if (!price) {
    console.error("[web-chat] no current model price to record usage with");
    return;
  }
  const { error } = await createServiceClient()
    .from("web_build_usage")
    .insert({
      user_id: account.user.id,
      request_key: requestKey.slice(0, 200),
      pc: pcForCall(usage, price),
      input_tokens: usage.promptTokens,
      output_tokens: usage.candidatesTokens + usage.thoughtsTokens,
    });
  if (error && !/duplicate|unique/i.test(error.message ?? "")) console.error("[web-chat] could not record usage:", error.code ?? "unknown");
}
