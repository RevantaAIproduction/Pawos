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
