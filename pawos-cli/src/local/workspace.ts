import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runGit, type GitRunner } from "../git/localRepository";

/**
 * The one folder PawOS may look at on this computer: the project the user started `pawos` in.
 *
 * Everything the local tools touch goes through `resolveInside`, which answers with a real path
 * inside that folder or a refusal. Three things are refused whoever asks, the service included:
 *   - anything outside the project (an absolute path, "..", or a link that leads out of it);
 *   - files that hold secrets (.env, private keys, credential files);
 *   - Git's own data and generated or installed code (.git, node_modules, build output).
 * The project's contents are treated as untrusted: a path is checked where it actually leads, not
 * where its name says it does.
 */
export interface Workspace {
  /** The project's top folder, as the file system really names it (links resolved). */
  root: string;
  /** The folder's name — the only part of its location PawOS's service is told. */
  name: string;
}

export function openWorkspace(root: string): Workspace | null {
  try {
    const real = fs.realpathSync.native(root);
    if (!fs.statSync(real).isDirectory()) return null;
    return { root: real, name: path.basename(real) || real };
  } catch {
    return null;
  }
}

/** Whether `target` is `root` itself or inside it. */
function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Why a folder that is not a Git repository can't be treated as a project, or null when it can.
 * A project folder is somewhere a person keeps one project — never a whole drive, the home folder
 * (or anything above it), or part of the operating system. Those hold far more than a project,
 * and PawOS does not work across them.
 */
export function projectFolderProblem(folder: string, home: string = os.homedir(), env: NodeJS.ProcessEnv = process.env): string | null {
  let real: string;
  try {
    real = fs.realpathSync.native(folder);
    if (!fs.statSync(real).isDirectory()) return "It isn't a folder.";
  } catch {
    return "It doesn't exist.";
  }
  if (path.dirname(real) === real) return "It is a whole drive, not a project folder.";
  let realHome = home;
  try {
    realHome = fs.realpathSync.native(home);
  } catch {
    // Compare with the path as given.
  }
  if (realHome && within(real, realHome)) return "It is your home folder (or above it), not a project folder.";
  const system = [env.SystemRoot, env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramData, "/etc", "/usr", "/bin", "/sbin", "/var", "/System", "/Library", "/boot", "/dev", "/proc"].filter((entry): entry is string => Boolean(entry));
  for (const place of system) {
    if (path.isAbsolute(place) && (within(place, real) || within(real, place))) return "It is part of the operating system.";
  }
  return null;
}

/**
 * The project the user is standing in. Inside a Git repository it is the top of the work tree.
 * Outside one, it is the folder `pawos` was started in — as long as that is a project folder and
 * not a drive, the home folder or part of the system (`projectFolderProblem`); there PawOS has no
 * project and reads nothing. A folder without Git works the same way otherwise: the same boundary,
 * the same protected files, the same questions before anything changes.
 */
export async function detectWorkspace(cwd: string, git: GitRunner = runGit, home: string = os.homedir()): Promise<Workspace | null> {
  const top = await git(["rev-parse", "--show-toplevel"], cwd);
  const root = top.ok ? top.stdout.trim() : "";
  if (root) return openWorkspace(root);
  return projectFolderProblem(cwd, home) === null ? openWorkspace(cwd) : null;
}

/** Folders never entered or listed: Git's data, installed dependencies, and generated output. */
export const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vercel",
  ".gradle",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  // Folders that hold credentials rather than code.
  ".ssh",
  ".aws",
  ".gnupg",
  ".azure",
  ".kube",
  ".docker",
]);

/** .env files that are templates, with no real values in them. */
const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist|defaults)$/;
const SECRET_NAMES = new Set([".npmrc", ".yarnrc", ".yarnrc.yml", ".netrc", "_netrc", ".pypirc", ".git-credentials", ".htpasswd", ".pgpass", "credentials", "credentials.json", "secrets.json", "secrets.yml", "secrets.yaml", "service-account.json", "serviceaccount.json", "terraform.tfvars"]);
const SECRET_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".kdbx", ".ppk", ".asc", ".gpg", ".tfstate", ".tfvars"]);
const SSH_KEY = /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/;

/** Why a path inside the project is off limits, or null when it may be read. Names are compared without regard to case. */
export function protectedReason(relative: string): string | null {
  const parts = relative.split(/[\\/]+/).filter(Boolean).map((part) => part.toLowerCase());
  for (const part of parts.slice(0, -1)) if (EXCLUDED_DIRECTORIES.has(part)) return excludedReason(part);
  const name = parts.at(-1);
  if (name === undefined) return null; // the project's own top folder
  if (EXCLUDED_DIRECTORIES.has(name)) return excludedReason(name);
  if ((name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) && !ENV_TEMPLATE.test(name)) return "It is an environment file, which can hold secrets.";
  if (SECRET_NAMES.has(name) || SSH_KEY.test(name) || SECRET_EXTENSIONS.has(path.extname(name)) || name.endsWith(".tfstate.backup")) return "It is a file that can hold keys or credentials.";
  return null;
}

const GENERATED = "Installed dependencies and generated output are not read.";

/**
 * Why a path must never be handed to a command, or null. Narrower than `protectedReason`: a
 * command may be pointed at built or installed code (node dist/server.js), never at secrets or at
 * Git's own data.
 */
export function secretReason(relative: string): string | null {
  const reason = protectedReason(relative);
  return reason === GENERATED ? null : reason;
}

function excludedReason(directory: string): string {
  if (directory === ".git") return "Git's own data is not read directly.";
  if ([".ssh", ".aws", ".gnupg", ".azure", ".kube", ".docker"].includes(directory)) return "It is a folder that holds credentials.";
  return GENERATED;
}

export type Resolved = { ok: true; absolute: string; relative: string } | { ok: false; reason: string };

const OUTSIDE = "It is outside the project.";

/** Forward slashes, whatever the platform — the form paths take in everything sent to PawOS. */
const portable = (relative: string) => relative.split(path.sep).join("/");

function contained(root: string, target: string): string | null {
  const relative = path.relative(root, target);
  if (relative === "") return "";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative;
}

/**
 * Turns a path the service named into a real location inside the project, or refuses it.
 * Only relative paths are taken. The path is checked twice: as written, and — when it exists — as
 * the file system resolves it, so a link inside the project can't lead to a file outside it or to a
 * protected one.
 */
export function resolveInside(workspace: Workspace, requested: string): Resolved {
  const wanted = requested.trim();
  if (wanted.includes("\0")) return { ok: false, reason: OUTSIDE };
  // Absolute paths, drive letters, UNC paths and "~" are never relative to the project.
  if (path.isAbsolute(wanted) || path.win32.isAbsolute(wanted) || /^[A-Za-z]:/.test(wanted) || wanted.startsWith("~")) return { ok: false, reason: OUTSIDE };
  // On Windows "name:stream" opens another part of the same file under a different name.
  if (process.platform === "win32" && wanted.includes(":")) return { ok: false, reason: OUTSIDE };
  const lexical = path.resolve(workspace.root, wanted === "" ? "." : wanted);
  const relative = contained(workspace.root, lexical);
  if (relative === null) return { ok: false, reason: OUTSIDE };
  const named = protectedReason(relative);
  if (named) return { ok: false, reason: named };

  let real: string;
  try {
    real = fs.realpathSync.native(lexical);
  } catch {
    // It doesn't exist (the tool will say so). Nothing was followed, so the checks above stand.
    return { ok: true, absolute: lexical, relative: portable(relative) };
  }
  const realRelative = contained(workspace.root, real);
  if (realRelative === null) return { ok: false, reason: "It is a link that leads outside the project." };
  const led = protectedReason(realRelative);
  if (led) return { ok: false, reason: led };
  return { ok: true, absolute: real, relative: portable(realRelative) };
}

export type ChangeTarget = { ok: true; absolute: string; relative: string; exists: boolean } | { ok: false; reason: string };

/**
 * Where a write, an edit or a delete may land. Everything `resolveInside` refuses is refused here,
 * and a change is held to more:
 *   - never the project's top folder itself;
 *   - never a link — PawOS changes files, it does not write or delete through links;
 *   - for a file that doesn't exist yet, the nearest folder that does exist is resolved for real,
 *     so new folders are only ever made inside the project;
 *   - never PawOS's own data (`forbidden`), wherever that is.
 */
export function resolveForChange(workspace: Workspace, requested: string, forbidden: string[] = []): ChangeTarget {
  const inside = resolveInside(workspace, requested);
  if (!inside.ok) return inside;
  if (inside.relative === "") return { ok: false, reason: "The project's top folder itself can't be changed or deleted." };
  const lexical = path.resolve(workspace.root, requested.trim());
  let found: fs.Stats | null;
  try {
    found = fs.lstatSync(lexical);
  } catch {
    found = null;
  }
  if (found?.isSymbolicLink()) return { ok: false, reason: "It is a link. PawOS changes files, not links." };

  let absolute = inside.absolute;
  if (!found) {
    // Not there yet. Find the folder it would be created under and see where that really is.
    let parent = path.dirname(lexical);
    while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
    let real: string;
    try {
      real = fs.realpathSync.native(parent);
      if (!fs.statSync(real).isDirectory()) return { ok: false, reason: "A file is in the way of that path." };
    } catch {
      return { ok: false, reason: OUTSIDE };
    }
    const parentRelative = contained(workspace.root, real);
    if (parentRelative === null) return { ok: false, reason: "It is under a link that leads outside the project." };
    absolute = path.join(real, path.relative(parent, lexical));
  }
  const relative = contained(workspace.root, absolute);
  if (relative === null || relative === "") return { ok: false, reason: OUTSIDE };
  const named = protectedReason(relative);
  if (named) return { ok: false, reason: named };
  for (const kept of forbidden) {
    let real = kept;
    try {
      real = fs.realpathSync.native(kept);
    } catch {
      // It doesn't exist; compare the path as given.
    }
    // Neither inside PawOS's own data, nor a folder that holds it.
    if (contained(real, absolute) !== null || contained(absolute, real) !== null) return { ok: false, reason: "It is PawOS's own data." };
  }
  return { ok: true, absolute, relative: portable(relative), exists: found !== null };
}

export interface Listing {
  files: string[];
  /** There were more files than the limit; these are the first, in order. */
  truncated: boolean;
}

/** Folder entries looked at before a listing gives up, so a huge tree can't hold the CLI up. */
const MAX_ENTRIES_WALKED = 60_000;

/**
 * The project's files under `start` (a path already resolved inside the project), as relative
 * paths in a steady order. Protected files and excluded folders are left out, and links are not
 * followed: a linked folder is neither entered nor listed.
 */
export async function listFiles(workspace: Workspace, start: string, limit: number, signal?: AbortSignal): Promise<Listing> {
  const files: string[] = [];
  let walked = 0;
  const queue: string[] = [start];
  while (queue.length > 0) {
    if (signal?.aborted) break;
    const directory = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      continue; // unreadable or gone: nothing to list
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const folders: string[] = [];
    for (const entry of entries) {
      walked += 1;
      if (walked > MAX_ENTRIES_WALKED) return { files, truncated: true };
      const absolute = path.join(directory, entry.name);
      const relative = contained(workspace.root, absolute);
      if (relative === null || relative === "" || protectedReason(relative)) continue;
      if (entry.isDirectory()) folders.push(absolute);
      else if (entry.isFile()) {
        if (files.length >= limit) return { files, truncated: true };
        files.push(portable(relative));
      }
    }
    queue.push(...folders);
  }
  return { files, truncated: false };
}
