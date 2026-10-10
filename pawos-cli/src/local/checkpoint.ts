import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { protectedReason, resolveForChange, type Workspace } from "./workspace";

/**
 * A way back from what one PawOS task did to the project's files.
 *
 * Before a task's first change to a file, PawOS notes what that file was (its contents, or that it
 * didn't exist), and afterwards what PawOS left there. That is the checkpoint: only the files this
 * task touched, never the whole project. It does not use Git, so it works the same for tracked,
 * untracked, new and deleted files.
 *
 * It is kept in PawOS's own folder, outside the project, bounded in size, and never holds a
 * protected file: PawOS refuses to change those in the first place, and refuses to copy them here.
 *
 * Restoring is never blind. A file is put back only if it is still exactly what PawOS left —
 * anything the user has changed since is theirs and is left alone, and reported.
 *
 * It covers changes made with PawOS's file tools. What a command did (a build's output, an
 * installed package) and what Git recorded (a commit) are not undone by it.
 */

export const CHECKPOINT_LIMITS = {
  /** Files one task's checkpoint may hold. */
  files: 2500,
  /** The largest single file kept. */
  fileBytes: 5_000_000,
  /** Everything one checkpoint keeps, together. */
  totalBytes: 50_000_000,
  /** Checkpoints kept per computer; older ones are removed. */
  kept: 5,
} as const;

/** What was at a path: nothing, a file (by its hash), or something that isn't a plain file (a link). */
export type FileState = { kind: "absent" } | { kind: "file"; sha256: string; bytes: number } | { kind: "other" };

export interface CheckpointEntry {
  /** The path inside the project, with forward slashes. */
  relative: string;
  before: FileState;
  /** Where the original contents are kept, when there were any. */
  blob: string | null;
  /** What PawOS left there. Null until the change has been made. */
  after: FileState | null;
}

export interface CheckpointManifest {
  version: 1;
  taskId: string;
  /** The project's real location: a checkpoint is only ever restored into the project it came from. */
  workspaceRoot: string;
  workspaceName: string;
  /** The start of what the user asked for, so they can recognise the task. */
  goal: string;
  createdAt: string;
  restoredAt: string | null;
  entries: CheckpointEntry[];
}

const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
const sameState = (a: FileState, b: FileState) => a.kind === b.kind && (a.kind !== "file" || (b.kind === "file" && a.sha256 === b.sha256));
const within = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/** What is at a path right now. A link is never followed. */
export function stateOf(absolute: string): FileState {
  let found: fs.Stats;
  try {
    found = fs.lstatSync(absolute);
  } catch {
    return { kind: "absent" };
  }
  if (!found.isFile()) return { kind: "other" };
  return { kind: "file", sha256: sha256(fs.readFileSync(absolute)), bytes: found.size };
}

export const checkpointsDirectory = (stateDirectory: string) => path.join(stateDirectory, "checkpoints");
const MANIFEST = "manifest.json";
const safeId = (taskId: string) => (/^[A-Za-z0-9-]{8,64}$/.test(taskId) ? taskId : crypto.createHash("sha256").update(taskId).digest("hex").slice(0, 32));

/** One task's checkpoint, as it is being made. */
export class TaskCheckpoint {
  private bytes = 0;

  private constructor(
    readonly directory: string,
    readonly manifest: CheckpointManifest,
    private readonly workspace: Workspace
  ) {}

  /**
   * Starts a checkpoint for a task, or answers null when there is nowhere safe to keep one: no
   * PawOS folder, or one that is inside the project itself (a checkpoint is never kept in the
   * project it protects).
   */
  static begin(stateDirectory: string | undefined, taskId: string, workspace: Workspace, goal: string, now: Date = new Date()): TaskCheckpoint | null {
    if (!stateDirectory) return null;
    try {
      const home = checkpointsDirectory(stateDirectory);
      // Where it would really be is worked out before anything is created: nothing is ever made
      // inside the project, not even an empty folder.
      let existing = path.resolve(home);
      while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
      const wouldBe = path.join(fs.realpathSync.native(existing), path.relative(existing, path.resolve(home)));
      if (within(workspace.root, wouldBe) || within(wouldBe, workspace.root)) return null;
      fs.mkdirSync(home, { recursive: true });
      const real = fs.realpathSync.native(home);
      if (within(workspace.root, real) || within(real, workspace.root)) return null;
      const directory = path.join(real, safeId(taskId));
      fs.mkdirSync(directory, { recursive: true });
      const checkpoint = new TaskCheckpoint(directory, { version: 1, taskId, workspaceRoot: workspace.root, workspaceName: workspace.name, goal: goal.replace(/\s+/g, " ").trim().slice(0, 160), createdAt: now.toISOString(), restoredAt: null, entries: [] }, workspace);
      checkpoint.save();
      prune(real, directory);
      return checkpoint;
    } catch {
      return null;
    }
  }

  private save(): void {
    fs.writeFileSync(path.join(this.directory, MANIFEST), JSON.stringify(this.manifest));
  }

  /**
   * Notes what is at these paths before PawOS changes them. A path already noted keeps its first
   * note: the checkpoint is of how things were when the task began. Answers with a reason instead
   * when a copy can't be kept — and then the change must not be made.
   */
  capture(relatives: string[]): { ok: true } | { ok: false; reason: string } {
    const fresh = relatives.filter((relative) => !this.manifest.entries.some((entry) => entry.relative === relative));
    if (this.manifest.entries.length + fresh.length > CHECKPOINT_LIMITS.files) return { ok: false, reason: `this task would change more than ${CHECKPOINT_LIMITS.files.toLocaleString("en-US")} files.` };
    const added: CheckpointEntry[] = [];
    try {
      for (const relative of fresh) {
        // Never a protected file: its contents are not copied anywhere.
        if (protectedReason(relative)) return { ok: false, reason: "a protected file is never copied." };
        const absolute = path.join(this.workspace.root, ...relative.split("/"));
        if (!within(this.workspace.root, absolute)) return { ok: false, reason: "a path is outside the project." };
        const before = stateOf(absolute);
        let blob: string | null = null;
        if (before.kind === "file") {
          if (before.bytes > CHECKPOINT_LIMITS.fileBytes) return { ok: false, reason: `${relative} is too large to keep a copy of.` };
          if (this.bytes + before.bytes > CHECKPOINT_LIMITS.totalBytes) return { ok: false, reason: "this task has changed more than PawOS keeps copies of." };
          const bytes = fs.readFileSync(absolute);
          // Named by what it holds, so nothing about the project's layout is in a file name.
          blob = `${sha256(bytes)}.bin`;
          fs.writeFileSync(path.join(this.directory, blob), bytes);
          this.bytes += bytes.length;
          before.sha256 = sha256(bytes);
          before.bytes = bytes.length;
        }
        added.push({ relative, before, blob, after: null });
      }
      this.manifest.entries.push(...added);
      this.save();
      return { ok: true };
    } catch {
      return { ok: false, reason: "the copy could not be written." };
    }
  }

  /** Notes what PawOS left at these paths, once the change has been made (or failed). */
  settle(relatives: string[]): void {
    for (const entry of this.manifest.entries) {
      if (relatives.includes(entry.relative)) entry.after = stateOf(path.join(this.workspace.root, ...entry.relative.split("/")));
    }
    try {
      this.save();
    } catch {
      // The change stands either way; without this note the file is simply reported as changed since.
    }
  }

  /** There is something to restore: at least one path that PawOS left different from how it found it. */
  get useful(): boolean {
    return this.manifest.entries.some((entry) => entry.after !== null && !sameState(entry.before, entry.after));
  }
}

/** Keeps the newest checkpoints and removes the rest, so they never pile up. */
function prune(home: string, keep: string): void {
  const all = fs
    .readdirSync(home, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(home, entry.name);
      let time = 0;
      try {
        time = fs.statSync(path.join(directory, MANIFEST)).mtimeMs;
      } catch {
        // No manifest: not a checkpoint worth keeping.
      }
      return { directory, time };
    })
    .filter((entry) => entry.directory !== keep)
    .sort((a, b) => b.time - a.time);
  for (const old of all.slice(CHECKPOINT_LIMITS.kept - 1)) fs.rmSync(old.directory, { recursive: true, force: true });
}

export interface FoundCheckpoint {
  directory: string;
  manifest: CheckpointManifest;
}

function readManifest(directory: string): CheckpointManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(directory, MANIFEST), "utf8")) as CheckpointManifest;
    if (raw.version !== 1 || typeof raw.workspaceRoot !== "string" || !Array.isArray(raw.entries)) return null;
    const state = (value: unknown): value is FileState => {
      const kind = (value as FileState | null)?.kind;
      return kind === "absent" || kind === "other" || (kind === "file" && /^[0-9a-f]{64}$/.test((value as { sha256?: string }).sha256 ?? ""));
    };
    for (const entry of raw.entries) {
      if (typeof entry.relative !== "string" || !state(entry.before) || (entry.after !== null && !state(entry.after))) return null;
      // A copy is only ever read from this checkpoint's own folder, by a name PawOS gave it.
      if (entry.blob !== null && !/^[0-9a-f]{64}\.bin$/.test(String(entry.blob))) return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** The most recent checkpoint of this project that still has something to undo. */
export function latestCheckpoint(stateDirectory: string | undefined, workspace: Workspace): FoundCheckpoint | null {
  if (!stateDirectory) return null;
  let names: string[];
  try {
    names = fs.readdirSync(checkpointsDirectory(stateDirectory));
  } catch {
    return null;
  }
  const found: FoundCheckpoint[] = [];
  for (const name of names) {
    const directory = path.join(checkpointsDirectory(stateDirectory), name);
    const manifest = readManifest(directory);
    if (!manifest || manifest.restoredAt !== null) continue;
    // Only ever this project's own checkpoints.
    if (path.relative(manifest.workspaceRoot, workspace.root) !== "") continue;
    if (!manifest.entries.some((entry) => entry.after !== null && !sameState(entry.before, entry.after))) continue;
    found.push({ directory, manifest });
  }
  found.sort((a, b) => (a.manifest.createdAt < b.manifest.createdAt ? 1 : -1));
  return found[0] ?? null;
}

export type RestoreAction =
  /** Put the original contents back over what PawOS wrote. */
  | "restore"
  /** Remove a file PawOS created. */
  | "remove"
  /** Bring back a file PawOS deleted. */
  | "recreate"
  /** Already as it was before the task. */
  | "unchanged"
  /** Changed since PawOS changed it: left alone. */
  | "conflict"
  /** Can't be restored (not allowed, or its copy is missing or damaged). */
  | "refused";

export interface RestoreItem {
  relative: string;
  action: RestoreAction;
  /** Why it is left alone, for a conflict or a refusal. */
  why: string | null;
}

export interface RestorePlan {
  /** Why nothing at all can be restored (the project is gone, or isn't the one this came from). */
  refused: string | null;
  items: RestoreItem[];
}

function judge(entry: CheckpointEntry, found: FoundCheckpoint, workspace: Workspace, forbidden: string[]): RestoreItem {
  const item = (action: RestoreAction, why: string | null = null): RestoreItem => ({ relative: entry.relative, action, why });
  if (entry.after === null) return item("unchanged");
  // The same rules as any change PawOS makes: inside the project, not protected, not through a link.
  const target = resolveForChange(workspace, entry.relative, forbidden);
  if (!target.ok) return item("refused", target.reason);
  const now = stateOf(target.absolute);
  if (sameState(now, entry.before)) return item("unchanged");
  // Only what PawOS itself left there is ever replaced or removed.
  if (!sameState(now, entry.after)) return item("conflict", now.kind === "absent" ? "It has been removed since PawOS changed it." : "It has changed since PawOS changed it.");
  if (entry.before.kind === "absent") return item("remove");
  if (entry.before.kind === "other") return item("refused", "It was a link, which PawOS doesn't recreate.");
  if (!entry.blob) return item("refused", "Its copy is missing.");
  try {
    if (sha256(fs.readFileSync(path.join(found.directory, entry.blob))) !== entry.before.sha256) return item("refused", "Its copy is damaged.");
  } catch {
    return item("refused", "Its copy is missing.");
  }
  return item(entry.after.kind === "absent" ? "recreate" : "restore");
}

/** Works out what restoring would do, path by path, without touching anything. */
export function planRestore(found: FoundCheckpoint, workspace: Workspace, forbidden: string[] = []): RestorePlan {
  let real: string;
  try {
    real = fs.realpathSync.native(found.manifest.workspaceRoot);
    if (!fs.statSync(real).isDirectory()) throw new Error("not a folder");
  } catch {
    return { refused: "The project these changes were made in is no longer there.", items: [] };
  }
  if (path.relative(real, workspace.root) !== "") return { refused: "These changes were made in a different project.", items: [] };
  return { refused: null, items: found.manifest.entries.map((entry) => judge(entry, found, workspace, forbidden)) };
}

export interface RestoreOutcome {
  restored: RestoreItem[];
  skipped: RestoreItem[];
}

/**
 * Restores what the plan says can be restored — checking each path again at the moment it is
 * touched, so a file the user edits while the question is open is still theirs. Afterwards the
 * checkpoint is marked as used.
 */
export function applyRestore(found: FoundCheckpoint, workspace: Workspace, forbidden: string[] = []): RestoreOutcome {
  const restored: RestoreItem[] = [];
  const skipped: RestoreItem[] = [];
  const plan = planRestore(found, workspace, forbidden);
  if (plan.refused) return { restored, skipped: found.manifest.entries.map((entry) => ({ relative: entry.relative, action: "refused", why: plan.refused })) };
  for (const entry of found.manifest.entries) {
    // Judged again here, not taken from an earlier look.
    const item = judge(entry, found, workspace, forbidden);
    if (item.action === "unchanged") continue;
    if (item.action === "conflict" || item.action === "refused") {
      skipped.push(item);
      continue;
    }
    const target = resolveForChange(workspace, entry.relative, forbidden);
    if (!target.ok) {
      skipped.push({ ...item, action: "refused", why: target.reason });
      continue;
    }
    try {
      if (item.action === "remove") fs.unlinkSync(target.absolute);
      else {
        const bytes = fs.readFileSync(path.join(found.directory, entry.blob!));
        if (item.action === "recreate") {
          fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
          // Only created: if something has appeared there in this instant, it is not replaced.
          fs.writeFileSync(target.absolute, bytes, { flag: "wx" });
        } else fs.writeFileSync(target.absolute, bytes);
      }
      restored.push(item);
    } catch {
      skipped.push({ ...item, action: "refused", why: "This computer didn't allow it." });
    }
  }
  found.manifest.restoredAt = new Date().toISOString();
  try {
    fs.writeFileSync(path.join(found.directory, MANIFEST), JSON.stringify(found.manifest));
  } catch {
    // The files are restored; the checkpoint just isn't marked as used.
  }
  return { restored, skipped };
}
