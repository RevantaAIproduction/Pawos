import type { AccountContext } from "./accountContext";
import { surfaceOfUsageCategory } from "../webPolicy/webCapabilities";

/**
 * The account's Paw Compute (PC) usage, from get_my_usage_summary() — the same server function the
 * desktop app's usage panel reads (see supabase/migrations/20261001000000_usage_buckets.sql). This
 * only reshapes that response for display; it computes no allowance of its own.
 */

export interface UsageBucket {
  id: string;
  label: string;
  type: string;
  pcTotal: number;
  pcUsed: number;
  percentUsed: number;
  status: string;
  /** When a monthly plan allowance resets. ISO string. */
  resetsAt: string | null;
  /** When a purchased allowance expires. ISO string. */
  expiresAt: string | null;
}

export interface UsageOverview {
  planLabel: string | null;
  buckets: UsageBucket[];
  weeklyPacing: { percentUsed: number; reached: boolean; resetsAt: string | null } | null;
  limitReached: boolean;
  limitResetsAt: string | null;
}

export interface SurfaceActivity {
  requests: number;
  pc: number;
}

/**
 * Recent charged activity split by where it happened. Web and Desktop draw on the same allowance;
 * this only labels the server's own usage events by their category (see surfaceOfUsageCategory).
 */
export interface UsageActivity {
  web: SurfaceActivity;
  desktop: SurfaceActivity;
  /** How many of the most recent usage events this covers. */
  events: number;
}

const ACTIVITY_EVENTS = 200;

/** Null when the history can't be read right now. */
export async function getUsageActivity(account: AccountContext): Promise<UsageActivity | null> {
  const { data, error } = await account.supabase.rpc("get_my_usage_history", { p_limit: ACTIVITY_EVENTS });
  if (error || !Array.isArray(data)) return null;
  const activity: UsageActivity = { web: { requests: 0, pc: 0 }, desktop: { requests: 0, pc: 0 }, events: data.length };
  for (const event of data as Record<string, unknown>[]) {
    const surface = activity[surfaceOfUsageCategory(str(event.category))];
    surface.requests += 1;
    surface.pc += num(event.pc);
  }
  activity.web.pc = Math.round(activity.web.pc * 10) / 10;
  activity.desktop.pc = Math.round(activity.desktop.pc * 10) / 10;
  return activity;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** Null when usage can't be read right now — the page says so rather than showing zeros. */
export async function getUsageOverview(account: AccountContext): Promise<UsageOverview | null> {
  const { data, error } = await account.supabase.rpc("get_my_usage_summary");
  if (error || !data || typeof data !== "object") return null;
  const summary = data as Record<string, unknown>;
  const plan = summary.plan as Record<string, unknown> | null;
  const pacing = summary.weeklyPacing as Record<string, unknown> | null;
  const buckets = Array.isArray(summary.buckets) ? (summary.buckets as Record<string, unknown>[]) : [];
  return {
    planLabel: plan ? str(plan.label) : null,
    buckets: buckets
      .filter((bucket) => bucket.status === "active" || bucket.status === "exhausted")
      .map((bucket) => ({
        id: String(bucket.id),
        label: str(bucket.label) ?? "Allowance",
        type: str(bucket.type) ?? "",
        pcTotal: num(bucket.pcTotal),
        pcUsed: num(bucket.pcUsed),
        percentUsed: Math.min(100, Math.max(0, num(bucket.percentUsed))),
        status: str(bucket.status) ?? "active",
        resetsAt: str(bucket.resetsAt),
        expiresAt: str(bucket.expiresAt),
      })),
    weeklyPacing: pacing ? { percentUsed: num(pacing.percentUsed), reached: pacing.reached === true, resetsAt: str(pacing.resetsAt) } : null,
    limitReached: summary.limitReached === true,
    limitResetsAt: str(summary.limitResetsAt),
  };
}

export interface ActivityItem {
  /** What happened, in plain words: a web chat's title, or the kind of desktop work. */
  label: string;
  surface: "web" | "desktop";
  at: string;
  /** Paw Compute charged, when the item was a charged usage event. */
  pc: number | null;
}

function categoryLabel(category: string | null): string {
  if (!category) return "PawOS work";
  const words = category.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Recent activity across Web and Desktop, labelled by where it happened. Web items are the
 * account's web chats (by title); Desktop items are its charged usage events (by kind of work —
 * the desktop keeps its conversations on the machine, so there is no title to show). Display only;
 * `surface` is never used to authorize anything.
 */
export async function getRecentActivity(account: AccountContext, limit = 8): Promise<ActivityItem[] | null> {
  const [chats, history] = await Promise.all([
    account.supabase.from("web_chats").select("title, updated_at").eq("user_id", account.user.id).order("updated_at", { ascending: false }).limit(limit),
    account.supabase.rpc("get_my_usage_history", { p_limit: ACTIVITY_EVENTS }),
  ]);
  if (chats.error && history.error) return null;
  const items: ActivityItem[] = [];
  for (const chat of (chats.data ?? []) as { title: string; updated_at: string }[]) {
    items.push({ label: chat.title, surface: "web", at: chat.updated_at, pc: null });
  }
  for (const event of (Array.isArray(history.data) ? history.data : []) as Record<string, unknown>[]) {
    const category = str(event.category);
    // Web chat usage is already represented by the chat itself.
    if (surfaceOfUsageCategory(category) === "web") continue;
    const at = str(event.at);
    if (at) items.push({ label: categoryLabel(category), surface: "desktop", at, pc: num(event.pc) });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
