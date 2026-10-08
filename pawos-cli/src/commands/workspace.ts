import * as fs from "fs";
import * as path from "path";
import type { CliContext } from "../context";
import type { ChatAttachment, RecentChat } from "../shared";
import { renderRefusal } from "../ui/account";
import type { Prompter } from "../ui/prompts";
import { ago, recentWork } from "../ui/recent";
import { blank, clean, cleanLines, line, seg, type Line } from "../ui/terminal";

/**
 * The workspace's own tools: how much PawOS asks before it changes code, opening earlier work, and
 * attaching a file to a message. Each is only what PawOS's service really supports — the list of
 * what it doesn't (choosing a model, sending a whole folder, approving a change edit by edit) is in
 * the README, and the commands say so too rather than pretend.
 */

/** How much PawOS asks before it changes code. */
export type PermissionMode = "ask" | "auto" | "plan";

export const MODE_SUMMARY: Record<PermissionMode, string> = {
  ask: "PawOS asks before every code change (allow, deny or always allow).",
  auto: "PawOS makes code changes without asking first.",
  plan: "PawOS plans the change with you and changes nothing.",
};

const MODE_NAMES: Record<string, PermissionMode> = { ask: "ask", manual: "ask", auto: "auto", plan: "plan" };
/**
 * Names people know from other tools. PawOS makes a change as one step on its servers — there is no
 * edit-by-edit approval to skip — so these all mean "don't ask first", and choosing one says so.
 */
const AUTO_ALIASES = new Set(["accept-edits", "acceptedits", "accept", "bypass", "bypass-permissions", "bypasspermissions"]);

export function parseMode(text: string): { mode: PermissionMode; alias: boolean } | null {
  const name = text.trim().toLowerCase().replace(/\s+/g, "-");
  if (Object.hasOwn(MODE_NAMES, name)) return { mode: MODE_NAMES[name]!, alias: false };
  return AUTO_ALIASES.has(name) ? { mode: "auto", alias: true } : null;
}

export function modeLines(mode: PermissionMode): Line[] {
  return [
    line("  ", seg("Mode: ", "muted"), seg(mode, "strong"), seg(`  ${MODE_SUMMARY[mode]}`, "muted")),
    line("  ", seg("/mode ask · /mode auto · /mode plan", "muted")),
  ];
}

export type Permission = "allow" | "deny" | "always";

/**
 * The question before a code change in ask mode. Only an explicit yes sends it: Enter, Ctrl+C, the
 * end of input and anything unclear are all "no", and what was typed as an answer is never sent on.
 */
export async function askPermission(prompter: Prompter, repository: string, print: (lines: Line[]) => void): Promise<Permission> {
  for (;;) {
    print([blank(), line("  ", seg("PawOS will change code in ", "muted"), clean(repository, 200), seg(" and push it to GitHub.", "muted"))]);
    const answer = await prompter.ask("  Allow? [y] allow  [n] deny  [a] always allow\n\n  > ");
    if (answer === null) return "deny";
    const text = answer.trim().toLowerCase();
    if (text === "y" || text === "yes" || text === "allow") return "allow";
    if (text === "a" || text === "always" || text === "always allow") return "always";
    if (text === "" || text === "n" || text === "no" || text === "deny") return "deny";
    print([line("  ", "Please answer y, n or a.")]);
  }
}

/** PawOS's own limit on an attached text file (WEB_POLICY.maxAttachmentBytes); the server enforces it too. */
export const MAX_ATTACHMENT_BYTES = 60_000;

/**
 * Reads the one file the user named so it can go with their next message. Text files only, within
 * PawOS's limit. Nothing else on the computer is read, and the file's contents are never printed.
 */
export function readAttachment(cwd: string, named: string): { ok: true; attachment: ChatAttachment; bytes: number } | { ok: false; problem: string } {
  const typed = named.trim();
  const wanted = typed.length > 1 && typed.startsWith('"') && typed.endsWith('"') ? typed.slice(1, -1) : typed;
  if (!wanted) return { ok: false, problem: "Which file? For example: /attach notes.txt" };
  const file = path.resolve(cwd, wanted);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: false, problem: "That file doesn't exist." };
  }
  if (stat.isDirectory()) return { ok: false, problem: "That is a folder. PawOS can take one text file with a message, not a folder." };
  if (!stat.isFile()) return { ok: false, problem: "That isn't a file PawOS can attach." };
  if (stat.size > MAX_ATTACHMENT_BYTES) return { ok: false, problem: `That file is too large. PawOS takes a text file of up to ${Math.round(MAX_ATTACHMENT_BYTES / 1000)} KB.` };
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return { ok: false, problem: "That file couldn't be read." };
  }
  if (!content.trim()) return { ok: false, problem: "That file is empty." };
  if (/[\u0000�]/.test(content)) return { ok: false, problem: "Only text and code files can be attached." };
  return { ok: true, attachment: { name: path.basename(file), content }, bytes: stat.size };
}

export const MAX_RESUME_LIST = 10;

/** `/resume` — the account's earlier PawOS conversations, numbered so one can be opened. */
export async function listPreviousWork(ctx: CliContext): Promise<RecentChat[]> {
  const { term } = ctx;
  let chats: RecentChat[];
  try {
    chats = await ctx.client.listChats();
  } catch (error) {
    term.print([blank(), ...renderRefusal(error, null, ""), blank()]);
    return [];
  }
  const now = ctx.now?.() ?? new Date();
  // Same rule as the start screen: only entries PawOS lists with a real title and time.
  const shown = recentWork(chats, MAX_RESUME_LIST);
  const usable = shown.map((item) => chats.find((chat) => clean(chat.title, 70) === item.title && new Date(chat.updatedAt).getTime() === item.at.getTime())).filter((chat): chat is RecentChat => Boolean(chat));
  if (usable.length === 0) {
    term.print([blank(), line("  ", seg("There is no earlier PawOS work to open yet.", "muted")), blank()]);
    return [];
  }
  term.print([
    blank(),
    line("  ", seg("Earlier work", "strong")),
    blank(),
    ...shown.map((item, index) => line("  ", seg(String(index + 1).padStart(2), "accent"), "  ", item.title, seg(`  ${ago(item.at, now)}${item.desktop ? " (Desktop)" : ""}`, "muted"))),
    blank(),
    line("  ", seg("/resume <number> to open one.", "muted")),
    blank(),
  ]);
  return usable;
}

const SHOWN_MESSAGES = 6;
const SHOWN_LINES = 8;

/** Opens one earlier conversation: shows how it ended, so the next message continues it. True when it opened. */
export async function openPreviousWork(ctx: CliContext, chat: RecentChat): Promise<boolean> {
  const { term } = ctx;
  let messages;
  try {
    messages = await ctx.client.getChat(chat.id);
  } catch (error) {
    term.print([blank(), ...renderRefusal(error, null, ""), blank()]);
    return false;
  }
  const lines: Line[] = [blank(), line("  ", seg("Opened: ", "muted"), seg(clean(chat.title, 70), "strong")), blank()];
  if (messages.length > SHOWN_MESSAGES) lines.push(line("  ", seg(`${term.glyphs.ellipsis} ${messages.length - SHOWN_MESSAGES} earlier messages`, "muted")), blank());
  for (const message of messages.slice(-SHOWN_MESSAGES)) {
    const text = cleanLines(message.content, SHOWN_LINES);
    lines.push(line("  ", seg(message.role === "user" ? "You:" : "PawOS:", "muted")), ...(text.length > 0 ? text : ["(empty)"]).map((part) => (part === "" ? blank() : line("  ", part))), blank());
  }
  lines.push(line("  ", seg("Your next message continues this conversation.", "muted")), blank());
  term.print(lines);
  return true;
}
