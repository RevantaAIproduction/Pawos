import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, lstat } from "node:fs/promises";

const execFileAsync = promisify(execFile);

function gitEnv() {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
  };
}

export async function runGitMetadata(args, cwd) {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "-c", "core.fsmonitor=false", "-c", "core.pager=cat", ...args], {
      encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 5_000, windowsHide: true, env: gitEnv(),
    });
    return result.stdout.trim();
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Git is required for Git history analysis. Install Git for Windows and try again.");
    return null;
  }
}

function parseWorktrees(text, fallbackRoot) {
  const result = [];
  for (const block of String(text || "").split(/\r?\n\r?\n/)) {
    const match = block.match(/^worktree (.+)$/m);
    if (!match) continue;
    result.push(path.resolve(match[1].trim()));
  }
  return result.length ? result : [fallbackRoot];
}

/** Resolve both ordinary repositories and linked worktrees using Git metadata only. */
export async function inspectGitRepository(candidatePath) {
  const candidate = await realpath(candidatePath).catch(() => null);
  if (!candidate) return null;
  const metadata = await runGitMetadata(["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], candidate);
  if (!metadata) return null;
  const [topLine, commonLine] = metadata.split(/\r?\n/);
  if (!topLine || !commonLine) return null;
  const root = await realpath(path.resolve(topLine)).catch(() => null);
  const commonDir = await realpath(path.resolve(candidate, commonLine)).catch(() => null);
  if (!root || !commonDir) return null;
  const marker = await lstat(path.join(root, ".git")).catch(() => null);
  if (!marker || marker.isSymbolicLink() || (!marker.isDirectory() && !marker.isFile())) return null;
  const listed = await runGitMetadata(["worktree", "list", "--porcelain"], root);
  const worktrees = [];
  for (const item of parseWorktrees(listed, root)) {
    const resolved = await realpath(item).catch(() => null);
    if (resolved && !worktrees.some(existing => existing.toLowerCase() === resolved.toLowerCase())) worktrees.push(resolved);
  }
  if (!worktrees.some(item => item.toLowerCase() === root.toLowerCase())) worktrees.unshift(root);
  const primaryRoot = worktrees[0] || root;
  return { root, primaryRoot, commonDir, worktrees, identity: commonDir.toLowerCase() };
}

export async function sameGitRepository(left, right) {
  const [a, b] = await Promise.all([inspectGitRepository(left), inspectGitRepository(right)]);
  return Boolean(a && b && a.identity === b.identity);
}

export function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
