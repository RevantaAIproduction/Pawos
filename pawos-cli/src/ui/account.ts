import { PawosApiError, plansUrl, type AccountOverview, type Capabilities, type Integration } from "../shared";
import { blank, clean, cleanLines, cleanUrl, line, seg, type Glyphs, type Line, type Tone } from "./terminal";

/**
 * The account as PawOS reports it: the plan, usage, credits, capabilities and connected services.
 * Every value shown here came from the server in this run. Nothing is computed, estimated,
 * remembered from an earlier run or filled in when the server didn't send it — a missing value is
 * simply not shown.
 */
const row = (label: string, value: string, tone?: Tone): Line => line("  ", seg(label.padEnd(16), "muted"), seg(value, tone));
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)).toLocaleString("en-US") : null);

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Plan allowances and extra usage, one line each, in the server's own units (Paw Compute). */
export function usageRows(overview: AccountOverview | null): Line[] {
  const usage = overview?.usage;
  if (!usage || !Array.isArray(usage.buckets)) return [];
  const rows: Line[] = [];
  for (const bucket of usage.buckets) {
    if (bucket.type === "purchased_credits") continue; // shown as Credits
    const used = number(bucket.pcUsed);
    const total = number(bucket.pcTotal);
    if (used === null || total === null) continue;
    const resets = day(bucket.resetsAt) ?? day(bucket.expiresAt);
    rows.push(row(rows.length === 0 ? "Usage" : "", `${clean(bucket.label, 60) || "Allowance"}: ${used} / ${total} PC${resets ? `, until ${resets}` : ""}`));
  }
  if (usage.limitReached) rows.push(row(rows.length === 0 ? "Usage" : "", `Limit reached${day(usage.limitResetsAt) ? `, resets ${day(usage.limitResetsAt)}` : ""}`, "warn"));
  else if (usage.weeklyPacing?.reached) rows.push(row(rows.length === 0 ? "Usage" : "", `This week's pace reached${day(usage.weeklyPacing.resetsAt) ? `, resets ${day(usage.weeklyPacing.resetsAt)}` : ""}`, "warn"));
  return rows;
}

/** Purchased credits the server reports as remaining. Absent when the account has none. */
export function creditsRow(overview: AccountOverview | null): Line[] {
  const buckets = (overview?.usage?.buckets ?? []).filter((bucket) => bucket.type === "purchased_credits");
  if (buckets.length === 0) return [];
  let remaining = 0;
  for (const bucket of buckets) {
    if (typeof bucket.pcTotal !== "number" || typeof bucket.pcUsed !== "number") return [];
    remaining += Math.max(0, bucket.pcTotal - bucket.pcUsed);
  }
  return [row("Credits", `${number(remaining)} PC`)];
}

const CAPABILITY_STATUS: Record<string, { text: string; tone?: Tone }> = {
  available: { text: "available", tone: "good" },
  locked: { text: "not included in your plan" },
  desktopOnly: { text: "PawOS Desktop only" },
  future: { text: "not available here yet" },
};

/** One capability from the server's own list, or nothing when the server didn't list it. */
export function capabilityRow(capabilities: Capabilities | null, id: string, label: string): Line[] {
  const found = capabilities?.capabilities?.find((capability) => capability.id === id);
  if (!found) return [];
  const known = CAPABILITY_STATUS[String(found.status)];
  if (!known) return [];
  return [row(label, found.status === "locked" && found.availableOn ? `${known.text} (available on ${clean(found.availableOn, 40)})` : known.text, known.tone)];
}

export function connectionsRow(integrations: Integration[] | null): Line[] {
  if (!integrations) return [];
  const connected = integrations.filter((integration) => integration.connection === "connected").map((integration) => clean(integration.name, 40));
  return [row("Connections", connected.length > 0 ? connected.join(", ") : "none connected")];
}

/** The account's connectors: what is connected, what needs attention, what the plan doesn't include. */
export function renderConnections(integrations: Integration[], glyphs: Glyphs): Line[] {
  if (integrations.length === 0) return [line("  ", seg("PawOS didn't list any connections.", "muted"))];
  return integrations.map((integration) => {
    const name = clean(integration.name, 40);
    const label = integration.accountLabel ? seg(`  ${clean(integration.accountLabel, 60)}`, "muted") : seg("");
    if (!integration.entitled) return line("  ", seg(glyphs.skipped, "muted"), " ", seg(name, "muted"), seg(`  not included in your plan${integration.availableOn ? ` (available on ${clean(integration.availableOn, 40)})` : ""}`, "muted"));
    if (integration.connection === "connected") return line("  ", seg(glyphs.done, "good"), " ", name, label);
    if (integration.connection === "needsReauth" || integration.connection === "error") return line("  ", seg(glyphs.failed, "warn"), " ", name, seg("  needs to be reconnected", "warn"));
    return line("  ", seg(glyphs.pending, "muted"), " ", name, seg("  not connected", "muted"));
  });
}

const LIMIT_CODES = new Set(["usage_limit_reached", "message_limit_reached"]);

/** True when PawOS refused a request because of the plan, its usage or its credits — never decided here. */
export function isPlanRefusal(error: unknown): error is PawosApiError {
  return error instanceof PawosApiError && (LIMIT_CODES.has(error.code ?? "") || error.code === "capability_locked" || error.status === 402);
}

/**
 * What to show when PawOS says no. The decision and its wording are the server's; this only frames
 * them and, for a plan or usage refusal, points at PawOS's own plans page. Nothing is retried, and
 * nothing here can turn a refusal into an allowance.
 */
export function renderRefusal(error: unknown, planLabel: string | null, apiBaseUrl: string): Line[] {
  const said = cleanLines(error instanceof Error ? error.message : "");
  const body = (said.length > 0 ? said : ["Something went wrong. Please try again."]).map((text) => line("  ", text));
  if (!isPlanRefusal(error)) return body;

  const limit = LIMIT_CODES.has(error.code ?? "") || error.status === 402;
  const plans = cleanUrl(plansUrl(apiBaseUrl));
  return [
    line("  ", seg(limit ? "PawOS usage limit reached." : "This isn't available on your current PawOS plan.", "warn")),
    blank(),
    ...body,
    ...(planLabel ? [blank(), line("  ", seg("Plan: ", "muted"), clean(planLabel, 60))] : []),
    ...(plans ? [blank(), line("  ", seg("Open PawOS to view available options:", "muted")), line(seg(plans, "accent", plans))] : []),
  ];
}
