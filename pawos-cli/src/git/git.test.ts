import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { githubRepositoryFromRemote } from "../shared";
import { harness } from "../testing/harness";
import { detectLocalRepository, explainLocalRepository, type GitRunner } from "./localRepository";

/** Finding the GitHub repository of the folder `pawos` was started in. */
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

/** A `git` that answers from a table of remotes, and records what it was asked. */
function fakeGit(remotes: Record<string, string> | "notGit" | "missing") {
  const asked: string[][] = [];
  const git: GitRunner = async (args) => {
    asked.push(args);
    if (remotes === "missing") return { ok: false, missing: true };
    if (remotes === "notGit") return { ok: false, missing: false };
    if (args[0] === "rev-parse") return { ok: true, stdout: "true\n" };
    if (args[0] === "remote" && args.length === 1) return { ok: true, stdout: `${Object.keys(remotes).join("\n")}\n` };
    if (args[0] === "remote" && args[1] === "get-url") return args[2]! in remotes ? { ok: true, stdout: `${remotes[args[2]!]}\n` } : { ok: false, missing: false };
    return { ok: false, missing: false };
  };
  return { git, asked };
}

describe("GitHub remote formats", () => {
  it.each([
    ["HTTPS GitHub remote", "https://github.com/owner/repo", "owner/repo"],
    ["HTTPS with the .git suffix", "https://github.com/owner/repo.git", "owner/repo"],
    ["SSH GitHub remote", "git@github.com:owner/repo", "owner/repo"],
    ["SSH with the .git suffix", "git@github.com:owner/repo.git", "owner/repo"],
    ["ssh:// form", "ssh://git@github.com/owner/repo.git", "owner/repo"],
  ])("%s", (_name, remote, expected) => {
    expect(githubRepositoryFromRemote(remote)).toBe(expected);
  });

  it.each([["not a url"], ["https://github.com/owner"], ["https://gitlab.com/owner/repo.git"], ["https://github.com.evil.example/owner/repo"], ["git@github.com:owner/repo/extra"], [""], ["https://github.com/owner/..git"]])("malformed remote: %s", (remote) => {
    expect(githubRepositoryFromRemote(remote)).toBeNull();
  });
});

describe("detecting the local repository", () => {
  it("reads the repository from origin with two read-only git queries", async () => {
    const { git, asked } = fakeGit({ origin: "git@github.com:acme/site.git" });
    expect(await detectLocalRepository("/work/site", git)).toEqual({ kind: "github", fullName: "acme/site", remote: "origin" });
    expect(asked).toEqual([["rev-parse", "--is-inside-work-tree"], ["remote"], ["remote", "get-url", "origin"]]);
  });

  it("prefers origin over other remotes, and uses another GitHub remote only when origin isn't one", async () => {
    expect(await detectLocalRepository("/w", fakeGit({ upstream: "https://github.com/other/site.git", origin: "https://github.com/acme/site.git" }).git)).toMatchObject({ fullName: "acme/site", remote: "origin" });
    expect(await detectLocalRepository("/w", fakeGit({ origin: "https://gitlab.com/acme/site.git", github: "https://github.com/acme/site.git" }).git)).toMatchObject({ fullName: "acme/site", remote: "github" });
  });

  it("non-Git directory", async () => {
    expect(await detectLocalRepository("/tmp/nothing", fakeGit("notGit").git)).toEqual({ kind: "notGit" });
  });

  it("Git not installed", async () => {
    expect(await detectLocalRepository("/w", fakeGit("missing").git)).toEqual({ kind: "gitMissing" });
  });

  it("a repository with no remote", async () => {
    expect(await detectLocalRepository("/w", fakeGit({}).git)).toEqual({ kind: "noRemote" });
  });

  it("a remote that isn't GitHub", async () => {
    expect(await detectLocalRepository("/w", fakeGit({ origin: "https://gitlab.com/acme/site.git" }).git)).toEqual({ kind: "notGitHub", remote: "https://gitlab.com/acme/site.git" });
  });

  it("explains each case in the user's terms", () => {
    expect(explainLocalRepository({ kind: "notGit" })[0]).toBe("This folder isn't a Git repository.");
    expect(explainLocalRepository({ kind: "gitMissing" })[0]).toContain("Git isn't installed");
    expect(explainLocalRepository({ kind: "noRemote" })[0]).toBe("This Git repository has no remote.");
    expect(explainLocalRepository({ kind: "notGitHub", remote: "x" })[0]).toBe("This repository's remote isn't on GitHub.");
  });

  const gitAvailable = (() => {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(gitAvailable)("works with the real git: a plain folder, then a repository with a GitHub remote", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pawos-cli-git-"));
    directories.push(directory);
    expect(await detectLocalRepository(directory)).toEqual({ kind: "notGit" });
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    expect(await detectLocalRepository(directory)).toEqual({ kind: "noRemote" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/site.git"], { cwd: directory });
    expect(await detectLocalRepository(directory)).toEqual({ kind: "github", fullName: "acme/site", remote: "origin" });
  });
});

describe("pawos in a folder without a GitHub repository", () => {
  it.each([
    [{ kind: "notGit" } as const, "This folder isn't a Git repository."],
    [{ kind: "noRemote" } as const, "This Git repository has no remote."],
    [{ kind: "notGitHub", remote: "https://gitlab.com/a/b.git" } as const, "This repository's remote isn't on GitHub."],
  ])("explains the problem and stops — it never falls back to the repository selected in PawOS", async (local, message) => {
    const h = harness({ signedIn: true, local, answers: ["fix the bug"] });
    expect(await runCli([], h.ctx)).toBe(1);
    const output = h.output();
    expect(output).toContain("No GitHub repository detected");
    expect(output).toContain(message);
    expect(output).toContain("PawOS is set to acme/site. It was not used");
    expect(output).not.toContain("What would you like PawOS to do?");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
    h.cleanup();
  });
});
