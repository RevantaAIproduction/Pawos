import type { CliContext } from "../context";
import { PawosApiError, type ConnectedTool } from "../shared";
import { renderRefusal } from "../ui/account";
import { blank, clean, cleanLines, cleanUrl, line, seg, type Line } from "../ui/terminal";
import { askYesOrCancel } from "./workspace";

/**
 * Connected tools in the terminal: `/tools`, `/github …` and `/linear …`.
 *
 * PawOS runs each tool on its servers with the account's own connection (POST /api/web/tools). The
 * CLI never holds a GitHub or Linear token — it sends the tool's name and arguments and shows what
 * comes back. Reading needs no question. Anything that changes a service (a comment) is shown first
 * and sent only after the user says yes; PawOS refuses it otherwise.
 *
 * What a service returns is that service's content: it is shown as text, never acted on.
 */

export type ToolCommand = { tool: string; args: Record<string, unknown>; write?: { what: string; where: string; text: string } } | { problem: string };

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const LINEAR_KEY = /^[A-Za-z][A-Za-z0-9]{0,9}-\d{1,7}$/;

/** "owner/repo#12", "#12" or "12" (in the current repository). */
function issueRef(token: string | undefined, defaultRepo: string | null): { repo: string; number: number } | null {
  if (!token) return null;
  const full = /^([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#(\d{1,7})$/.exec(token);
  if (full) return { repo: full[1] ?? "", number: Number(full[2]) };
  const local = /^#?(\d{1,7})$/.exec(token);
  if (local && defaultRepo) return { repo: defaultRepo, number: Number(local[1]) };
  return null;
}

const STATES = new Set(["open", "closed", "all"]);

export const GITHUB_USAGE = "/github repos · repo [owner/name] · issues [owner/name] [open|closed|all] · issue <owner/name#12 | 12> · prs [owner/name] · pr <owner/name#3 | 3> · file <path | owner/name:path> [ref] · comment <owner/name#12 | 12> <text>";
export const LINEAR_USAGE = "/linear issues · issue <ENG-123> · search <text> · comment <ENG-123> <text>";

/** `/github …` — the current repository (when PawOS was started inside one) fills in a missing owner/name. */
export function parseGitHubCommand(argument: string, defaultRepo: string | null): ToolCommand {
  const [sub = "", ...rest] = argument.trim().split(/\s+/).filter(Boolean);
  const repoOr = (token: string | undefined) => (token && REPO.test(token) ? token : defaultRepo);
  const needRepo = { problem: `Which repository? Give it as owner/name${defaultRepo ? "" : " (or start PawOS inside a GitHub repository)"}.` };
  switch (sub.toLowerCase()) {
    case "repos":
    case "repositories":
      return { tool: "github.repositories", args: {} };
    case "repo":
    case "repository": {
      const repo = repoOr(rest[0]);
      return repo ? { tool: "github.repository", args: { repo } } : needRepo;
    }
    case "issues":
    case "prs":
    case "pulls": {
      const explicit = rest[0] && REPO.test(rest[0]);
      const repo = repoOr(rest[0]);
      const state = (explicit ? rest[1] : rest[0])?.toLowerCase();
      if (!repo) return needRepo;
      if (state && !STATES.has(state)) return { problem: "The state is open, closed or all." };
      return { tool: sub.toLowerCase() === "issues" ? "github.issues" : "github.pulls", args: { repo, ...(state ? { state } : {}) } };
    }
    case "issue":
    case "pr":
    case "pull": {
      const ref = issueRef(rest[0], defaultRepo);
      if (!ref) return { problem: `Give it as owner/name#12${defaultRepo ? " or just 12" : ""}.` };
      return { tool: sub.toLowerCase() === "issue" ? "github.issue" : "github.pull", args: { repo: ref.repo, number: ref.number } };
    }
    case "file": {
      // Another repository's file is written as owner/name:path (as git writes ref:path).
      const [target, ref] = rest;
      const other = target ? /^([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}):(.+)$/.exec(target) : null;
      const repo = other ? other[1] : defaultRepo;
      const filePath = other ? other[2] : target;
      if (!repo) return { problem: "Which repository? Give the file as owner/name:path (or start PawOS inside a GitHub repository)." };
      if (!filePath) return { problem: "Which file? Give its path in the repository." };
      return { tool: "github.file", args: { repo, path: filePath, ...(ref ? { ref } : {}) } };
    }
    case "comment": {
      const ref = issueRef(rest[0], defaultRepo);
      const text = rest.slice(1).join(" ").trim();
      if (!ref) return { problem: `Give the issue or pull request as owner/name#12${defaultRepo ? " or just 12" : ""}, then the comment.` };
      if (!text) return { problem: "What should the comment say?" };
      return { tool: "github.comment", args: { repo: ref.repo, number: ref.number, body: text }, write: { what: "Comment on", where: `${ref.repo}#${ref.number}`, text } };
    }
    default:
      return { problem: GITHUB_USAGE };
  }
}

/** `/linear …` */
export function parseLinearCommand(argument: string): ToolCommand {
  const [sub = "", ...rest] = argument.trim().split(/\s+/).filter(Boolean);
  switch (sub.toLowerCase()) {
    case "issues":
    case "mine":
    case "my":
      return { tool: "linear.myIssues", args: {} };
    case "issue": {
      const key = rest[0];
      return key && LINEAR_KEY.test(key) ? { tool: "linear.issue", args: { id: key.toUpperCase() } } : { problem: "Give the issue's key, for example /linear issue ENG-123." };
    }
    case "search": {
      const query = rest.join(" ").trim();
      return query ? { tool: "linear.search", args: { query } } : { problem: "What should PawOS search Linear for?" };
    }
    case "comment": {
      const key = rest[0];
      const text = rest.slice(1).join(" ").trim();
      if (!key || !LINEAR_KEY.test(key)) return { problem: "Give the issue's key, then the comment: /linear comment ENG-123 <text>." };
      if (!text) return { problem: "What should the comment say?" };
      return { tool: "linear.comment", args: { id: key.toUpperCase(), body: text }, write: { what: "Comment on", where: key.toUpperCase(), text } };
    }
    default:
      return { problem: LINEAR_USAGE };
  }
}

// ── showing results ─────────────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const str = (value: unknown, max = 300) => clean(typeof value === "string" ? value : value === null || value === undefined ? "" : String(value), max);
const list = (value: unknown): Obj[] => (Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Obj[]) : []);
const link = (value: unknown): Line[] => {
  const url = cleanUrl(typeof value === "string" ? value : "");
  return url ? [line("    ", seg(url, "accent", url))] : [];
};
const text = (value: unknown, maxLines = 30): Line[] => cleanLines(typeof value === "string" ? value : "", maxLines).map((t) => (t === "" ? blank() : line("    ", t)));

export function renderToolResult(tool: string, data: unknown): Line[] {
  const d = (data && typeof data === "object" ? data : {}) as Obj;
  const empty = (what: string) => [line("  ", seg(`No ${what}.`, "muted"))];
  switch (tool) {
    case "github.repositories": {
      const repos = list(d.repositories);
      return repos.length === 0 ? empty("repositories") : repos.map((r) => line("  ", seg(str(r.fullName, 120), "strong"), seg(`  ${r.private ? "private" : "public"}${r.canPush ? "" : " · read only"}${r.description ? ` · ${str(r.description, 80)}` : ""}`, "muted")));
    }
    case "github.repository": {
      const r = (d.repository ?? {}) as Obj;
      return [line("  ", seg(str(r.fullName, 120), "strong"), seg(`  ${r.private ? "private" : "public"} · default branch ${str(r.defaultBranch, 60)}`, "muted")), ...(r.description ? [line("    ", str(r.description))] : []), line("    ", seg(`${str(r.openIssues, 10) || "0"} open issues and pull requests`, "muted")), ...link(r.url)];
    }
    case "github.issues":
    case "github.pulls": {
      const items = list(tool === "github.issues" ? d.issues : d.pulls);
      return items.length === 0 ? empty(tool === "github.issues" ? "issues" : "pull requests") : items.map((i) => line("  ", seg(`#${str(i.number, 10)}`, "strong"), ` ${str(i.title, 160)}`, seg(`  ${str(i.state, 20)}${i.author ? ` · ${str(i.author, 40)}` : ""}${list(i.labels).length === 0 && Array.isArray(i.labels) && i.labels.length > 0 ? ` · ${(i.labels as unknown[]).map((l) => str(l, 30)).join(", ")}` : ""}`, "muted")));
    }
    case "github.issue":
    case "github.pull": {
      const item = ((tool === "github.issue" ? d.issue : d.pull) ?? {}) as Obj;
      const lines: Line[] = [line("  ", seg(`${str(d.repository, 120)}#${str(item.number, 10)}`, "strong"), ` ${str(item.title, 200)}`), line("    ", seg(`${str(item.state, 20)}${item.author ? ` · opened by ${str(item.author, 40)}` : ""}${tool === "github.pull" ? ` · ${str(item.head, 60)} → ${str(item.base, 60)}` : ""}`, "muted")), ...link(item.url), blank(), ...text(item.body)];
      for (const f of list(d.files).slice(0, 50)) lines.push(line("    ", seg(`${str(f.status, 12).padEnd(9)} `, "muted"), str(f.path, 200), seg(`  +${str(f.additions, 8)} −${str(f.deletions, 8)}`, "muted")));
      for (const c of list(d.comments)) lines.push(blank(), line("    ", seg(`${str(c.author, 40) || "someone"} · ${str(c.createdAt, 30)}`, "muted")), ...text(c.body, 10));
      return lines;
    }
    case "github.file":
      return [line("  ", seg(`${str(d.repository, 120)}: ${str(d.path, 200)}${d.ref ? ` @ ${str(d.ref, 60)}` : ""}`, "strong")), blank(), ...cleanLines(typeof d.content === "string" ? d.content : "", 200).map((t) => line("    ", t))];
    case "linear.myIssues":
    case "linear.search": {
      const issues = list(d.issues);
      return issues.length === 0 ? empty("issues") : issues.map((i) => line("  ", seg(str(i.key, 20), "strong"), ` ${str(i.title, 160)}`, seg(`  ${str(i.status, 30)}${i.priority ? ` · ${str(i.priority, 20)}` : ""}${i.assignee ? ` · ${str(i.assignee, 40)}` : ""}`, "muted")));
    }
    case "linear.issue": {
      const i = (d.issue ?? {}) as Obj;
      return [line("  ", seg(str(i.key, 20), "strong"), ` ${str(i.title, 200)}`), line("    ", seg(`${str(i.status, 30)}${i.priority ? ` · ${str(i.priority, 20)}` : ""}${i.assignee ? ` · assigned to ${str(i.assignee, 40)}` : ""}${i.reporter ? ` · reported by ${str(i.reporter, 40)}` : ""}`, "muted")), ...link(i.url), blank(), ...text(i.description)];
    }
    case "github.comment":
    case "linear.comment":
      return [line("  ", seg("Comment posted.", "good")), ...link(d.url)];
    default:
      return [line("  ", seg("PawOS answered, but this version of the CLI can't show it.", "muted"))];
  }
}

// ── running ─────────────────────────────────────────────────────────────────────────────────────

function baseUrl(ctx: CliContext): string {
  return ctx.config.ok ? ctx.config.config.apiBaseUrl : "";
}

export const COMMENT_QUESTION = "  Post this comment? [y] post  [n] cancel\n\n  > ";

/** Runs one parsed tool command: a read straight away, a write only after the user's yes. */
export async function runToolCommand(ctx: CliContext, command: ToolCommand, planLabel: string | null = null): Promise<boolean> {
  const { term } = ctx;
  if ("problem" in command) {
    term.print([blank(), line("  ", seg(clean(command.problem, 600), "muted")), blank()]);
    return false;
  }
  if (command.write) {
    term.print([blank(), line("  ", seg(`${command.write.what} ${clean(command.write.where, 160)}:`, "strong")), ...cleanLines(command.write.text, 30).map((t) => line("    ", t)), blank()]);
    if ((await askYesOrCancel(ctx.prompter, COMMENT_QUESTION, (lines) => term.print(lines))) !== "allow") {
      term.print([blank(), line("  ", seg("Cancelled. Nothing was posted.", "muted")), blank()]);
      return false;
    }
  }
  try {
    const result = await ctx.client.runTool(command.tool, command.args, Boolean(command.write));
    term.print([blank(), ...renderToolResult(result.tool, result.data), blank()]);
    return true;
  } catch (error) {
    term.print([blank(), ...toolRefusal(error, command.tool, planLabel, baseUrl(ctx)), blank()]);
    return false;
  }
}

function toolRefusal(error: unknown, tool: string, planLabel: string | null, base: string): Line[] {
  const provider = tool.startsWith("linear.") ? "linear" : "github";
  const name = provider === "linear" ? "Linear" : "GitHub";
  if (error instanceof PawosApiError && (error.code === "not_connected" || error.code === "needs_reauth")) {
    return [line("  ", seg(clean(error.message, 300), "warn")), line("  ", seg(`/connect ${provider} shows where to ${error.code === "needs_reauth" ? "reconnect" : "connect"} ${name}.`, "muted"))];
  }
  if (error instanceof PawosApiError && error.code === "not_entitled") {
    return renderRefusal(new PawosApiError("forbidden", error.message, 403, "capability_locked"), planLabel, base);
  }
  return renderRefusal(error, planLabel, base);
}

/** `/tools` — what PawOS can do in connected services from here, and what the plan includes. */
export async function showTools(ctx: CliContext): Promise<void> {
  const { term } = ctx;
  try {
    const { available, tools } = await ctx.client.listTools();
    if (!available) {
      term.print([blank(), line("  ", seg("Connected tools aren't included in your PawOS plan.", "warn")), blank()]);
      return;
    }
    const byProvider = new Map<string, ConnectedTool[]>();
    for (const t of tools) byProvider.set(t.provider, [...(byProvider.get(t.provider) ?? []), t]);
    const lines: Line[] = [blank(), line("  ", seg("Connected tools", "strong")), line("  ", seg("PawOS runs these with your own connection. Changes are asked about first.", "muted"))];
    for (const [provider, list] of byProvider) {
      const locked = list.find((t) => !t.entitled);
      lines.push(blank(), line("  ", seg(provider === "linear" ? "Linear" : provider === "github" ? "GitHub" : clean(provider, 30), "strong"), ...(locked ? [seg(`  not on your plan${locked.availableOn ? ` (available on ${clean(locked.availableOn, 40)})` : ""}`, "warn")] : [])));
      for (const t of list) lines.push(line("    ", seg(t.access === "write" ? "change " : "read   ", t.access === "write" ? "warn" : "muted"), clean(t.summary, 160)));
    }
    lines.push(blank(), line("  ", seg(GITHUB_USAGE, "muted")), line("  ", seg(LINEAR_USAGE, "muted")), blank());
    term.print(lines);
  } catch (error) {
    term.print([blank(), ...renderRefusal(error, null, baseUrl(ctx)), blank()]);
  }
}
