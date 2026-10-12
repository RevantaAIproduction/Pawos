import * as fs from "fs";
import { AGENT_CLIENT_LIMITS, toolRisk, type ToolCall, type ToolResult } from "../shared";
import { runLocalGit, type LocalGit } from "../git/localRepository";
import { listFiles, protectedReason, resolveInside, type Workspace } from "./workspace";

/**
 * The local tools: what PawOS can do on this computer, one call at a time.
 *
 * These tools only LOOK. Nothing here writes a file, runs a project's command or changes Git (the
 * tools that change files are in local/changes.ts, behind the user's approval). A tool
 * is run only if this file says it reads (`toolRisk`, decided from the tool's name here — never
 * from anything the service sends), every path goes through the workspace's checks, and every
 * result is capped before it leaves this function.
 *
 * Git is run by the one place in the CLI that starts a program (git/localRepository.ts): directly,
 * with an argument list (no shell), a time limit and an output limit, and told not to run anything
 * a repository's configuration could name (external diff tools, text converters, the file-system
 * monitor) or to take locks.
 */

const LIMITS = AGENT_CLIENT_LIMITS;
/** Lines of a file returned by one read; a longer file is read in parts. */
export const READ_LINES = 400;
/** Search: matching lines returned, and files looked through, per call. */
export const SEARCH_MATCHES = 80;
export const SEARCH_FILES = 4000;
const SEARCH_LINE_CHARS = 240;
export const LIST_FILES = 400;
export const LOG_COMMITS = 50;
/** Changed files one diff covers. */
const DIFF_FILES = 150;

export interface ToolEnvironment {
  signal?: AbortSignal;
  /** Runs Git in the project (tests replace it to see exactly what would be run). */
  git?: LocalGit;
}

const done = (call: ToolCall, output: string, truncated = false): ToolResult => cap({ id: call.id, ok: true, output, ...(truncated ? { truncated: true } : {}) });
const failed = (call: ToolCall, reason: string): ToolResult => ({ id: call.id, ok: false, output: reason });
const denied = (call: ToolCall, reason: string): ToolResult => ({ id: call.id, ok: false, denied: true, output: `Not allowed: ${reason}` });

/** No result leaves the tools longer than the limit, whatever produced it. */
function cap(result: ToolResult): ToolResult {
  if (result.output.length <= LIMITS.resultChars) return result;
  return { ...result, output: `${result.output.slice(0, LIMITS.resultChars)}\n… (cut short)`, truncated: true };
}

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

/**
 * Runs one tool call in the project and answers with its result. It never throws: a refusal, a
 * missing file and a failed Git query all come back as a result the service can read.
 */
export async function executeTool(call: ToolCall, workspace: Workspace, environment: ToolEnvironment = {}): Promise<ToolResult> {
  const { signal } = environment;
  const git = environment.git ?? runLocalGit;
  // Decided here, from the name. Only tools that read are run by this function, whoever asks.
  if (toolRisk(call.name) !== "read") return denied(call, "that isn't a reading tool.");
  if (signal?.aborted) return failed(call, "Stopped.");
  const text = (key: string): string => (typeof call.args[key] === "string" ? (call.args[key] as string) : "");

  try {
    switch (call.name) {
      case "list_files": {
        const where = resolveInside(workspace, text("path"));
        if (!where.ok) return denied(call, where.reason);
        const stat = await fs.promises.stat(where.absolute).catch(() => null);
        if (!stat) return failed(call, "That folder doesn't exist.");
        if (!stat.isDirectory()) return failed(call, "That is a file, not a folder.");
        const listing = await listFiles(workspace, where.absolute, LIST_FILES, signal);
        if (listing.files.length === 0) return done(call, "(no files)");
        return done(call, `${listing.files.join("\n")}${listing.truncated ? `\n… (more files — list a folder inside this one)` : ""}`, listing.truncated);
      }

      case "read_file": {
        const where = resolveInside(workspace, text("path"));
        if (!where.ok) return denied(call, where.reason);
        const stat = await fs.promises.stat(where.absolute).catch(() => null);
        if (!stat) return failed(call, "That file doesn't exist.");
        if (!stat.isFile()) return failed(call, "That is not a file.");
        if (stat.size > LIMITS.fileBytes) return failed(call, `That file is too large to read (${Math.round(stat.size / 1000).toLocaleString("en-US")} KB; the limit is ${LIMITS.fileBytes / 1000} KB).`);
        const bytes = await fs.promises.readFile(where.absolute, { signal });
        if (bytes.length > LIMITS.fileBytes) return failed(call, "That file is too large to read.");
        if (isBinary(bytes)) return failed(call, "That file isn't text.");
        const lines = bytes.toString("utf8").split(/\r?\n/);
        const asked = typeof call.args.startLine === "number" ? Math.floor(call.args.startLine) : 1;
        const first = Math.min(Math.max(1, asked), Math.max(1, lines.length));
        // The header is counted too, so the whole result stays inside the limit.
        const room = LIMITS.resultChars - 200;
        const shown: string[] = [];
        let used = 0;
        for (let index = first - 1; index < lines.length && shown.length < READ_LINES; index++) {
          const next = lines[index]!;
          if (used + next.length + 1 > room) {
            if (shown.length === 0) shown.push(`${next.slice(0, room)} … (line cut short)`);
            break;
          }
          shown.push(next);
          used += next.length + 1;
        }
        const last = first + shown.length - 1;
        const more = last < lines.length;
        const header = `${where.relative} — lines ${first}-${last} of ${lines.length}${more ? ` (read again with startLine ${last + 1} for more)` : ""}`;
        return done(call, `${header}\n${shown.join("\n")}`, more);
      }

      case "search_files": {
        const query = text("query");
        if (!query.trim()) return failed(call, "Nothing to search for.");
        const where = resolveInside(workspace, text("path"));
        if (!where.ok) return denied(call, where.reason);
        const stat = await fs.promises.stat(where.absolute).catch(() => null);
        if (!stat) return failed(call, "That folder doesn't exist.");
        const listing = stat.isDirectory() ? await listFiles(workspace, where.absolute, SEARCH_FILES, signal) : { files: [where.relative], truncated: false };
        const needle = query.toLowerCase();
        const matches: string[] = [];
        let full = false;
        for (const file of listing.files) {
          if (signal?.aborted) return failed(call, "Stopped.");
          // Each file is checked again where it really is: the listing's names are not trusted on their own.
          const target = resolveInside(workspace, file);
          if (!target.ok) continue;
          const size = await fs.promises.stat(target.absolute).then((found) => (found.isFile() ? found.size : -1), () => -1);
          if (size < 0 || size > LIMITS.fileBytes) continue;
          const bytes = await fs.promises.readFile(target.absolute).catch(() => null);
          if (!bytes || isBinary(bytes) || !bytes.toString("utf8").toLowerCase().includes(needle)) continue;
          const lines = bytes.toString("utf8").split(/\r?\n/);
          for (let index = 0; index < lines.length; index++) {
            if (!lines[index]!.toLowerCase().includes(needle)) continue;
            if (matches.length >= SEARCH_MATCHES) {
              full = true;
              break;
            }
            const shown = lines[index]!.trim();
            matches.push(`${file}:${index + 1}: ${shown.length > SEARCH_LINE_CHARS ? `${shown.slice(0, SEARCH_LINE_CHARS)}…` : shown}`);
          }
          if (full) break;
        }
        if (matches.length === 0) return done(call, `No matches for "${query}".${listing.truncated ? " (Not every file was searched — narrow it to a folder.)" : ""}`, listing.truncated);
        return done(call, `${matches.join("\n")}${full ? "\n… (more matches — narrow the search)" : ""}`, full || listing.truncated);
      }

      case "git_status": {
        const status = await git(["status", "--porcelain=v1", "--branch", "--untracked-files=normal"], workspace.root, signal);
        if (!status.ok) return failed(call, status.reason);
        // The branch line, then one line per changed path. Protected paths are left out, names included.
        const lines = status.stdout.split(/\r?\n/).filter((entry) => entry !== "" && (entry.startsWith("## ") || !statusPaths(entry).some((file) => protectedReason(file))));
        return done(call, lines.length > 0 ? lines.join("\n") : "(nothing to report)");
      }

      case "git_diff": {
        const staged = call.args.staged === true;
        const base = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", ...(staged ? ["--cached"] : [])];
        let only: string[] = [];
        if (text("path")) {
          const where = resolveInside(workspace, text("path"));
          if (!where.ok) return denied(call, where.reason);
          only = [where.relative];
        }
        // Which files changed first, so the diff itself is only ever asked for files that may be read.
        const named = await git([...base, "--name-only", "-z", "--", ...only], workspace.root, signal);
        if (!named.ok) return failed(call, named.reason);
        const changed = named.stdout.split("\0").filter(Boolean);
        const allowed = changed.filter((file) => resolveInside(workspace, file).ok);
        const hidden = changed.length - allowed.length;
        const hiddenNote = hidden > 0 ? `\n(${hidden} protected ${hidden === 1 ? "file is" : "files are"} not shown.)` : "";
        if (allowed.length === 0) return done(call, `(no ${staged ? "staged " : "uncommitted "}changes${only.length > 0 ? " in that path" : ""})${hiddenNote}`);
        const covered = allowed.slice(0, DIFF_FILES);
        const diff = await git([...base, "--", ...covered], workspace.root, signal);
        if (!diff.ok) return failed(call, diff.reason);
        const more = allowed.length > covered.length;
        return done(call, `${diff.stdout.trimEnd()}${more ? `\n… (${allowed.length - covered.length} more changed files — ask for one by path)` : ""}${hiddenNote}`, more);
      }

      case "git_log": {
        const asked = typeof call.args.limit === "number" ? Math.floor(call.args.limit) : 15;
        const count = Math.min(Math.max(1, asked), LOG_COMMITS);
        const log = await git(["log", `-n${count}`, "--no-color", "--date=short", "--pretty=format:%h %ad %an: %s"], workspace.root, signal);
        if (!log.ok) return failed(call, log.reason);
        return done(call, log.stdout.trimEnd() || "(no commits yet)");
      }

      default:
        return denied(call, "that isn't a reading tool.");
    }
  } catch (error) {
    if (signal?.aborted || (error as { name?: string } | null)?.name === "AbortError") return failed(call, "Stopped.");
    // The reason is PawOS's own wording: an operating-system error can carry the full path on this computer.
    return failed(call, "PawOS couldn't read that.");
  }
}

/** The path (or, for a rename, both paths) on one line of `git status --porcelain=v1`. */
function statusPaths(entry: string): string[] {
  const unquote = (value: string) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);
  return entry.slice(3).split(" -> ").map(unquote);
}

/** A few words on what a tool call is doing, for the progress line. Paths are the project's own, never absolute. */
export function describeCall(call: ToolCall): string {
  const named = typeof call.args.path === "string" && call.args.path.trim() ? call.args.path.trim() : "";
  switch (call.name) {
    case "list_files":
      return named ? `Listing ${named}` : "Listing the project's files";
    case "read_file":
      return `Reading ${named || "a file"}`;
    case "search_files":
      return `Searching for "${String(call.args.query ?? "")}"`;
    case "git_status":
      return "Checking Git status";
    case "git_diff":
      return named ? `Reading the changes in ${named}` : "Reading the uncommitted changes";
    case "git_log":
      return "Reading recent commits";
    case "write_file":
      return `Writing ${named || "a file"}`;
    case "edit_file":
      return `Editing ${named || "a file"}`;
    case "delete_path":
      return `Deleting ${named || "a path"}`;
    case "start_process":
      return `Starting ${typeof call.args.command === "string" ? call.args.command : "a program"}`;
    case "stop_process":
      return "Stopping a program";
    case "process_status":
      return "Checking a running program";
    case "open_browser":
      return "Opening the browser";
    case "git_add":
      return "Staging files";
    case "git_commit":
      return "Committing";
    case "git_branch":
      return `Creating the branch ${typeof call.args.name === "string" ? call.args.name : ""}`.trim();
    case "git_checkout":
      return `Switching to ${typeof call.args.branch === "string" ? call.args.branch : "a branch"}`;
    case "git_push":
      return "Pushing";
    case "run_tests":
      return "Running the tests";
    case "build":
      return "Running the build";
    case "run_command":
      return `Running ${typeof call.args.command === "string" ? call.args.command : "a command"}`;
    default:
      return "Finishing";
  }
}
