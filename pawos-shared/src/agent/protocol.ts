/**
 * The contract between PawOS's service and a client that works on a project on the user's own
 * computer (the PawOS CLI's local mode).
 *
 * The service does the thinking: it holds the model key, checks the account's plan and usage, and
 * on each turn names ONE tool for the client to run. The client does the doing: it runs that tool
 * locally and sends the result back. The two never trade places — the service runs nothing on the
 * user's machine, and the client never talks to a model.
 *
 * The tools are a fixed list. A client runs nothing that is not on it, and decides for itself how
 * risky each one is (`toolRisk`): nothing the service sends can declare a tool "safe".
 *
 * PawOS Web keeps its own copy of this contract (pawos-web/src/lib/webAgent/protocol.ts), because
 * the web app is built on its own; a test in the CLI fails if the two tool lists ever differ.
 */

/** Reading, changing files, running development commands, and a fixed set of Git operations. */
export const AGENT_TOOL_NAMES = ["list_files", "read_file", "search_files", "git_status", "git_diff", "git_log", "write_file", "edit_file", "delete_path", "run_command", "run_tests", "build", "git_add", "git_commit", "git_branch", "git_checkout", "git_push", "finish"] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/**
 * What a tool does to the user's machine.
 *   read     looks, changes nothing
 *   write    creates or changes a file
 *   delete   removes a file or a folder
 *   execute  runs a program
 *   git      changes the Git repository (stages, commits, branches, switches, pushes)
 *   control  ends the task; touches nothing
 */
export type ToolRisk = "read" | "write" | "delete" | "execute" | "git" | "control";

const RISK: Record<AgentToolName, ToolRisk> = {
  list_files: "read",
  read_file: "read",
  search_files: "read",
  git_status: "read",
  git_diff: "read",
  git_log: "read",
  write_file: "write",
  edit_file: "write",
  delete_path: "delete",
  run_command: "execute",
  run_tests: "execute",
  build: "execute",
  git_add: "git",
  git_commit: "git",
  git_branch: "git",
  git_checkout: "git",
  git_push: "git",
  finish: "control",
};

export function isAgentToolName(name: unknown): name is AgentToolName {
  return typeof name === "string" && (AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

/** How risky a tool is — decided here from its name alone, never from anything the service says. */
export function toolRisk(name: AgentToolName): ToolRisk {
  return RISK[name];
}

export type ToolArgValue = string | number | boolean | string[];

/** One thing the service asks the client to do. */
export interface ToolCall {
  id: string;
  name: AgentToolName;
  args: Record<string, ToolArgValue>;
}

/** What happened when the client did it (or why it didn't). */
export interface ToolResult {
  id: string;
  ok: boolean;
  /** What the tool produced, or the reason it failed. Text only, already capped by the client. */
  output: string;
  /** The output was cut to fit the limits. */
  truncated?: boolean;
  /** The client refused to run it (outside the workspace, a protected file, or the user said no). */
  denied?: boolean;
  /** A command's exit code (null when it was stopped before it could exit). Only on results of commands. */
  exitCode?: number | null;
  /** The signal that ended a command, when one did. */
  signal?: string | null;
  /** The command was stopped because it ran too long. */
  timedOut?: boolean;
  /** The command was stopped because the user pressed Ctrl+C. */
  cancelled?: boolean;
}

/** The little the service is told about the project up front: names only, never file contents. */
export interface WorkspaceInfo {
  /** The project folder's name — not its path on the user's computer. */
  name: string;
  branch: string | null;
  /** Paths relative to the project root, capped. Protected and generated files are never listed. */
  files: string[];
  filesTruncated: boolean;
}

/** One step of a task, as the service returns it. */
export type LocalTaskTurn = { kind: "tool"; call: ToolCall; note: string | null } | { kind: "finish"; summary: string };

/** The arguments each tool takes. Anything else in `args` is dropped, and a wrong type refuses the call. */
const ARGS: Record<AgentToolName, Record<string, { type: "string" | "number" | "boolean" | "strings"; required?: boolean; max?: number; empty?: boolean; maxItems?: number }>> = {
  list_files: { path: { type: "string", max: 400 } },
  read_file: { path: { type: "string", required: true, max: 400 }, startLine: { type: "number" } },
  search_files: { query: { type: "string", required: true, max: 200 }, path: { type: "string", max: 400 } },
  git_status: {},
  git_diff: { path: { type: "string", max: 400 }, staged: { type: "boolean" } },
  git_log: { limit: { type: "number" } },
  // A whole file's new contents. Text only; an empty file is allowed.
  write_file: { path: { type: "string", required: true, max: 400 }, content: { type: "string", required: true, max: 200_000, empty: true } },
  // A structured edit: this exact text, replaced by that text. Never an instruction to run.
  edit_file: { path: { type: "string", required: true, max: 400 }, oldText: { type: "string", required: true, max: 60_000 }, newText: { type: "string", required: true, max: 60_000, empty: true }, replaceAll: { type: "boolean" } },
  delete_path: { path: { type: "string", required: true, max: 400 } },
  // One program and its arguments, as a list. Never a line for a shell to interpret.
  run_command: { command: { type: "string", required: true, max: 64 }, args: { type: "strings", max: 2000, maxItems: 64 }, cwd: { type: "string", max: 400 } },
  // The project's own test and build scripts: the client works out the command, not the model.
  run_tests: { cwd: { type: "string", max: 400 } },
  build: { cwd: { type: "string", max: 400 } },
  // Git operations with typed inputs. There is nowhere to put a flag: the client builds the command.
  git_add: { paths: { type: "strings", required: true, max: 400, maxItems: 100 } },
  git_commit: { message: { type: "string", required: true, max: 2000 } },
  git_branch: { name: { type: "string", required: true, max: 200 } },
  git_checkout: { branch: { type: "string", required: true, max: 200 }, create: { type: "boolean" } },
  git_push: { remote: { type: "string", max: 100 } },
  finish: { summary: { type: "string", required: true, max: 8000 } },
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A tool call exactly as the contract allows it, or null. Unknown tools and malformed arguments are refused, not repaired. */
export function parseToolCall(raw: unknown): ToolCall | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as { id?: unknown; name?: unknown; args?: unknown };
  if (typeof value.id !== "string" || !ID.test(value.id) || !isAgentToolName(value.name)) return null;
  const given = value.args && typeof value.args === "object" && !Array.isArray(value.args) ? (value.args as Record<string, unknown>) : {};
  const args: Record<string, ToolArgValue> = {};
  for (const [key, rule] of Object.entries(ARGS[value.name])) {
    const arg = given[key];
    if (arg === undefined || arg === null) {
      if (rule.required) return null;
      continue;
    }
    if (rule.type === "strings") {
      if (!Array.isArray(arg) || arg.length > (rule.maxItems ?? 64) || (rule.required && arg.length === 0)) return null;
      if (arg.some((item) => typeof item !== "string" || (rule.max !== undefined && item.length > rule.max) || item.includes("\0"))) return null;
      args[key] = [...(arg as string[])];
      continue;
    }
    if (typeof arg !== rule.type) return null;
    if (typeof arg === "number" && !Number.isFinite(arg)) return null;
    if (typeof arg === "string") {
      if ((rule.required && !rule.empty && !arg.trim()) || (rule.max !== undefined && arg.length > rule.max) || arg.includes("\0")) return null;
    }
    args[key] = arg as ToolArgValue;
  }
  return { id: value.id, name: value.name, args };
}

export function parseTurn(raw: unknown): LocalTaskTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { kind?: unknown; call?: unknown; note?: unknown; summary?: unknown };
  if (value.kind === "finish") return typeof value.summary === "string" ? { kind: "finish", summary: value.summary } : null;
  if (value.kind !== "tool") return null;
  const call = parseToolCall(value.call);
  // "finish" is a turn of its own, never a tool to run.
  if (!call || call.name === "finish") return null;
  return { kind: "tool", call, note: typeof value.note === "string" && value.note.trim() ? value.note.trim().slice(0, 300) : null };
}

/** What the client sends for a turn: the task to start, or the result of the tool it was asked to run. */
export type AgentTurnRequest = { taskId: string; goal: string; workspace: WorkspaceInfo } | { taskId: string; result: ToolResult };

export interface AgentTurnResponse {
  turn: LocalTaskTurn;
  /** How many more steps the service will take for this task. */
  turnsLeft: number;
}

/** The client's own ceilings on what leaves the machine. The service has its own; neither trusts the other's. */
export const AGENT_CLIENT_LIMITS = {
  /** Paths listed to the service when a task starts. */
  workspaceFiles: 400,
  /** Characters of one tool result. */
  resultChars: 20_000,
  /** Characters of file content and tool output sent for one task, in total. */
  taskChars: 400_000,
  /** A single file larger than this is not read at all. */
  fileBytes: 512_000,
  /** Steps the client will run for one task, whatever the service asks. */
  turns: 40,
  /** How long one task may take. */
  taskMs: 10 * 60 * 1000,
} as const;
