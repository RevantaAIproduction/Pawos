import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProject, type GitRunner } from "./localRepository";

/** The project context PawOS shows: the folder, and only what Git actually reports about it. */
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

/** A `git` that answers from a description of the repository, and records what it was asked. */
function fakeGit(repo: { remotes?: Record<string, string>; branch?: string | null } | "notGit" | "missing") {
  const asked: string[][] = [];
  const git: GitRunner = async (args) => {
    asked.push(args);
    if (repo === "missing") return { ok: false, missing: true };
    if (repo === "notGit") return { ok: false, missing: false };
    const remotes = repo.remotes ?? {};
    if (args[0] === "rev-parse") return { ok: true, stdout: "true\n" };
    if (args[0] === "remote" && args.length === 1) return { ok: true, stdout: `${Object.keys(remotes).join("\n")}\n` };
    if (args[0] === "remote" && args[1] === "get-url") return args[2]! in remotes ? { ok: true, stdout: `${remotes[args[2]!]}\n` } : { ok: false, missing: false };
    // `git symbolic-ref --short -q HEAD` prints the branch, or fails (quietly) when HEAD is detached.
    if (args[0] === "symbolic-ref") return repo.branch ? { ok: true, stdout: `${repo.branch}\n` } : { ok: false, missing: false };
    return { ok: false, missing: false };
  };
  return { git, asked };
}

describe("project context", () => {
  it("current working directory: reported exactly as given, for any folder", async () => {
    for (const cwd of ["C:\\Projects\\MyApp", "C:\\Users\\APPLE\\Downloads\\PawOS", "/home/dev/api"]) {
      expect((await detectProject(cwd, fakeGit("notGit").git)).cwd).toBe(cwd);
    }
  });

  it("Git repository + branch", async () => {
    const { git, asked } = fakeGit({ remotes: { origin: "https://github.com/owner/repo.git" }, branch: "main" });
    expect(await detectProject("/w", git)).toEqual({ cwd: "/w", branch: "main", repository: { kind: "github", fullName: "owner/repo", remote: "origin" } });
    // The branch is asked of Git itself, read-only.
    expect(asked).toContainEqual(["symbolic-ref", "--short", "-q", "HEAD"]);
    for (const args of asked) expect(args[0]).toMatch(/^(rev-parse|remote|symbolic-ref)$/);
  });

  it("the branch is whatever Git says — never a default", async () => {
    for (const branch of ["develop", "feature/login-fix", "release-2.0", "master"]) {
      expect((await detectProject("/w", fakeGit({ remotes: { origin: "git@github.com:o/r.git" }, branch }).git)).branch).toBe(branch);
    }
  });

  it("Git repository with no branch (detached HEAD): the repository is still found, the branch is null", async () => {
    expect(await detectProject("/w", fakeGit({ remotes: { origin: "https://github.com/owner/repo" }, branch: null }).git)).toEqual({
      cwd: "/w",
      branch: null,
      repository: { kind: "github", fullName: "owner/repo", remote: "origin" },
    });
  });

  it("a branch Git reports as empty is no branch", async () => {
    const git: GitRunner = async (args) => (args[0] === "rev-parse" ? { ok: true, stdout: "true\n" } : args[0] === "symbolic-ref" ? { ok: true, stdout: "  \n" } : { ok: true, stdout: "" });
    expect((await detectProject("/w", git)).branch).toBeNull();
  });

  it("non-Git directory: no branch, no repository, and Git is not asked for a branch", async () => {
    const { git, asked } = fakeGit("notGit");
    expect(await detectProject("/tmp/notes", git)).toEqual({ cwd: "/tmp/notes", branch: null, repository: { kind: "notGit" } });
    expect(asked.some((args) => args[0] === "symbolic-ref")).toBe(false);
  });

  it("Git not installed: the folder alone", async () => {
    expect(await detectProject("/w", fakeGit("missing").git)).toEqual({ cwd: "/w", branch: null, repository: { kind: "gitMissing" } });
  });

  it("Git repository without a GitHub remote: the branch, and no repository", async () => {
    expect(await detectProject("/w", fakeGit({ remotes: {}, branch: "main" }).git)).toEqual({ cwd: "/w", branch: "main", repository: { kind: "noRemote" } });
    expect(await detectProject("/w", fakeGit({ remotes: { origin: "https://gitlab.com/a/b.git" }, branch: "main" }).git)).toEqual({
      cwd: "/w",
      branch: "main",
      repository: { kind: "notGitHub", remote: "https://gitlab.com/a/b.git" },
    });
  });

  it.each([
    ["HTTPS remote", "https://github.com/owner/repo"],
    ["HTTPS remote with the .git suffix", "https://github.com/owner/repo.git"],
    ["SSH remote", "git@github.com:owner/repo"],
    ["SSH remote with the .git suffix", "git@github.com:owner/repo.git"],
  ])("GitHub remote parsing: %s", async (_name, remote) => {
    expect((await detectProject("/w", fakeGit({ remotes: { origin: remote }, branch: "main" }).git)).repository).toEqual({ kind: "github", fullName: "owner/repo", remote: "origin" });
  });

  const gitAvailable = (() => {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(gitAvailable)("with the real git: a plain folder, a new repository, a named branch, then a detached HEAD", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pawos-cli-project-"));
    directories.push(directory);
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=PawOS Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: directory, stdio: "ignore" });

    expect(await detectProject(directory)).toEqual({ cwd: directory, branch: null, repository: { kind: "notGit" } });

    git("init", "--quiet");
    git("checkout", "--quiet", "-b", "feature/context");
    git("remote", "add", "origin", "git@github.com:acme/site.git");
    expect(await detectProject(directory)).toEqual({ cwd: directory, branch: "feature/context", repository: { kind: "github", fullName: "acme/site", remote: "origin" } });

    git("commit", "--quiet", "--allow-empty", "-m", "first");
    git("checkout", "--quiet", "--detach");
    // Detached: the repository is still known, and no branch is made up.
    expect(await detectProject(directory)).toEqual({ cwd: directory, branch: null, repository: { kind: "github", fullName: "acme/site", remote: "origin" } });
  });
});
