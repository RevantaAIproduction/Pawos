import type { RecentChat } from "../shared";
import { blank, clean, line, seg, type Line } from "./terminal";

/**
 * "Recent activity" on the start screen: the account's own previous PawOS work, as PawOS lists it —
 * the conversations and code tasks it already holds, from the CLI, Web or Desktop. It is shown only
 * when there is some. With none there is no panel, no heading and no empty box; and nothing about
 * this run (starting PawOS, signing in, /status) is ever counted as work.
 */
export const MAX_RECENT = 3;

/** How long ago, in a few characters. A time PawOS reports from the future is simply "just now". */
export function ago(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return then.toISOString().slice(0, 10);
}

/** The entries that are really previous work: a title and a time PawOS gave, newest first. */
export function recentWork(chats: unknown, limit: number = MAX_RECENT): { title: string; at: Date; desktop: boolean }[] {
  if (!Array.isArray(chats)) return [];
  const items: { title: string; at: Date; desktop: boolean }[] = [];
  for (const chat of chats as Partial<RecentChat>[]) {
    const title = typeof chat?.title === "string" ? clean(chat.title, 70) : "";
    const at = typeof chat?.updatedAt === "string" ? new Date(chat.updatedAt) : null;
    if (!title || !at || Number.isNaN(at.getTime())) continue;
    items.push({ title, at, desktop: chat.surface === "desktop" });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/**
 * The panel's content, one line each: a heading, the items (when, then what), and how to open one.
 * None at all when there is no previous work — the caller then draws no panel and no box.
 */
export function recentLines(chats: unknown, now: Date): Line[] {
  const items = recentWork(chats);
  if (items.length === 0) return [];
  const when = items.map((item) => `${ago(item.at, now)}${item.desktop ? " (Desktop)" : ""}`);
  const column = Math.max(...when.map((text) => [...text].length));
  return [
    line(seg("Recent activity", "strong")),
    ...items.map((item, index) => line(seg(when[index]!.padEnd(column), "muted"), "  ", item.title)),
    line(seg("/resume to open one", "muted")),
  ];
}

/** The same panel without a box, for a terminal too narrow to hold one. */
export function renderRecent(chats: unknown, now: Date): Line[] {
  const lines = recentLines(chats, now);
  if (lines.length === 0) return [];
  return [...lines.map((segments, index) => line(index === 0 ? "  " : "    ", ...segments)), blank()];
}
