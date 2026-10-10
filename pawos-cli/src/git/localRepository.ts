import { execFile } from "child_process";
import { githubRepositoryFromRemote } from "../shared";

/**
 * The GitHub repository of the folder the CLI was started in, read from its Git remotes with
 * `git` itself. Read-only: two `git` queries, no fetch, no change to the repository — and the CLI
 * never picks a repository the folder doesn't name.
 */
export type LocalRepository =
  | { kind: "github"; fullName: string; remote: string }
  | { kind: "notGit" }
  | { kind: "gitMissing" }
  | { kind: "noRemote" }
  | { kind: "notGitHub"; remote: string };

/** Runs `git` with these arguments in a folder; resolves its output, or null when it failed. */
export type GitRunner = (args: string[], cwd: string) => Promise<{ ok: true; stdout: string } | { ok: false; missing: boolean }>;

export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 10_000, windowsHide: true, encoding: "utf8" }, (error, stdout) => {
      if (error) resolve({ ok: false, missing: (error as NodeJS.ErrnoException).code === "ENOENT" });
      else resolve({ ok: true, stdout });
    });
  });

export async function detectLocalRepository(cwd: string, git: GitRunner = runGit): Promise<LocalRepository> {
  const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok) return inside.missing ? { kind: "gitMissing" } : { kind: "notGit" };
  if (inside.stdout.trim() !== "true") return { kind: "notGit" };

  const listed = await git(["remote"], cwd);
  const names = listed.ok ? listed.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean) : [];
  if (names.length === 0) return { kind: "noRemote" };
  // `origin` first — the remote a clone is made from — then the others in Git's order.
  const ordered = [...names].sort((a, b) => Number(b === "origin") - Number(a === "origin"));

  let firstUrl: string | null = null;
  for (const name of ordered) {
    const url = await git(["remote", "get-url", name], cwd);
    const remote = url.ok ? url.stdout.trim() : "";
    if (!remote) continue;
    firstUrl ??= remote;
    const fullName = githubRepositoryFromRemote(remote);
    if (fullName) return { kind: "github", fullName, remote: name };
  }
  return firstUrl ? { kind: "notGitHub", remote: firstUrl } : { kind: "noRemote" };
}

/** Why there is no GitHub repository to work on, in the user's terms. */
export function explainLocalRepository(local: Exclude<LocalRepository, { kind: "github" }>): string[] {
  switch (local.kind) {
    case "gitMissing":
      return ["Git isn't installed, or isn't on your PATH.", "Install Git, then run pawos from your project's folder."];
    case "notGit":
      return ["This folder isn't a Git repository.", "Run pawos from the folder of a project cloned from GitHub."];
    case "noRemote":
      return ["This Git repository has no remote.", "Push it to GitHub (git remote add origin …), then run pawos again."];
    case "notGitHub":
      return ["This repository's remote isn't on GitHub.", "PawOS works on GitHub repositories."];
  }
}

/** Where `pawos` was started: the folder, and what Git says about it. Nothing here is assumed. */
export interface ProjectContext {
  /** The folder the user ran `pawos` in (process.cwd()). */
  cwd: string;
  /** The branch that is checked out — null outside a Git repository, or when HEAD is detached. */
  branch: string | null;
  repository: LocalRepository;
}

/**
 * Reads the project the user is standing in. The branch comes from `git symbolic-ref`, which only
 * answers when HEAD points at a branch: on a detached HEAD, or outside a repository, there is no
 * branch and none is reported. One more read-only query; nothing is fetched or changed.
 */
export async function detectProject(cwd: string, git: GitRunner = runGit): Promise<ProjectContext> {
  const repository = await detectLocalRepository(cwd, git);
  if (repository.kind === "notGit" || repository.kind === "gitMissing") return { cwd, branch: null, repository };
  const head = await git(["symbolic-ref", "--short", "-q", "HEAD"], cwd);
  const branch = head.ok ? head.stdout.trim() : "";
  return { cwd, branch: branch || null, repository };
}

/**
 * Git for the local tools (local/tools.ts): read-only queries in the project, with a time limit, an
 * output limit and a way to stop them. Like `runGit` it starts Git directly with an argument list —
 * no shell, so nothing in a path or a file name is ever interpreted.
 */
const GIT_TIMEOUT_MS = 15_000;
const GIT_OUTPUT_BYTES = 4_000_000;

export type GitAnswer = { ok: true; stdout: string } | { ok: false; reason: string; /** The end of what Git said, when it said why. */ detail?: string };
export type LocalGit = (args: string[], cwd: string, signal?: AbortSignal, timeoutMs?: number) => Promise<GitAnswer>;

/** Settings that keep a Git query from running anything the repository's configuration names. */
export const GIT_SAFE_CONFIG = ["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-c", "color.ui=false"];

export const runLocalGit: LocalGit = (args, cwd, signal, timeoutMs = GIT_TIMEOUT_MS) =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...GIT_SAFE_CONFIG, ...args],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: GIT_OUTPUT_BYTES,
        windowsHide: true,
        encoding: "utf8",
        signal,
        // Paths are paths, never pathspec magic; no locks are taken; Git never stops to ask for anything.
        env: { ...process.env, GIT_LITERAL_PATHSPECS: "1", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
      },
      (error, stdout, stderr) => {
        if (!error) return resolve({ ok: true, stdout });
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        if (failure.code === "ENOENT") return resolve({ ok: false, reason: "Git isn't installed, or isn't on your PATH." });
        if (failure.name === "AbortError" || signal?.aborted) return resolve({ ok: false, reason: "Stopped." });
        if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return resolve({ ok: false, reason: "Git's answer was too large to read." });
        if (failure.killed) return resolve({ ok: false, reason: "Git took too long to answer." });
        const said = `${String(stderr ?? "").trim()}`.slice(-1500);
        resolve({ ok: false, reason: "Git couldn't answer that here.", ...(said ? { detail: said } : {}) });
      }
    );
  });
