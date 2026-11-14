import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { discoverProject } from "../src/discovery/projectDiscovery.js";

function git(root, ...args) { execFileSync("git", ["-C", root, ...args], { stdio: "ignore" }); }

async function initRepo(root, fileName = "README.md") {
  await mkdir(root, { recursive: true });
  git(root, "init", "-q");
  await writeFile(path.join(root, fileName), "fixture repository\n");
  git(root, "add", fileName);
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture");
}

test("parent discovery excludes Claude worktrees, groups their Git identity, and keeps independent clones", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-repository-parent-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const parent = path.join(temp, "repos");
  const pawos = path.join(parent, "PawOS");
  const independent = path.join(parent, "independent");
  await initRepo(pawos);
  await initRepo(independent);
  const worktreeA = path.join(pawos, ".claude", "worktrees", "agent-a");
  const worktreeB = path.join(pawos, ".claude", "worktrees", "agent-b");
  await mkdir(path.dirname(worktreeA), { recursive: true });
  git(pawos, "worktree", "add", "--detach", worktreeA, "HEAD");
  git(pawos, "worktree", "add", "--detach", worktreeB, "HEAD");

  const result = await discoverProject(parent);
  assert.equal(result.inventory.discoveryMode, "repository_parent");
  assert.equal(result.repositories.length, 2);
  const pawosRepo = result.repositories.find(repo => repo.primaryRoot.toLowerCase() === pawos.toLowerCase());
  assert.ok(pawosRepo);
  assert.equal(pawosRepo.worktrees.length, 3);
  assert.equal(result.repositories.some(repo => repo.primaryRoot.toLowerCase() === worktreeA.toLowerCase()), false);
  assert.equal(result.repositories.some(repo => repo.primaryRoot.toLowerCase() === worktreeB.toLowerCase()), false);
  assert.equal(result.repositories.some(repo => repo.primaryRoot.toLowerCase() === independent.toLowerCase()), true);
  assert.equal(result.inventory.candidates.filter(candidate => candidate.type === "git_metadata").length, 2);
});

test("running inside a repository selects one project and groups registered worktrees", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-inside-repo-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "PawOS");
  await initRepo(repo);
  const worktree = path.join(repo, ".claude", "worktrees", "agent");
  await mkdir(path.dirname(worktree), { recursive: true });
  git(repo, "worktree", "add", "--detach", worktree, "HEAD");

  const result = await discoverProject(repo);
  assert.equal(result.inventory.discoveryMode, "single_repository");
  assert.equal(result.repositories.length, 1);
  assert.equal(result.repositories[0].primaryRoot.toLowerCase(), repo.toLowerCase());
  assert.equal(result.repositories[0].worktrees.length, 2);
});

test("CLI completes all-repository report generation without a fatal message after success", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-parent-cli-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const parent = path.join(temp, "repos");
  await initRepo(path.join(parent, "PawOS"));
  await initRepo(path.join(parent, "second-project"));
  const appData = path.join(temp, "Local App Data");
  const home = path.join(temp, "isolated-home");
  await mkdir(home, { recursive: true });
  const env = { ...process.env, LOCALAPPDATA: appData, USERPROFILE: home, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
  const cli = path.resolve("src/cli.js");
  const child = spawnSync(process.execPath, [cli], { cwd: parent, input: "all\n", encoding: "utf8", env, timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Combined developer overview created for 2 selected repositories/);
  assert.doesNotMatch(child.stderr + child.stdout, /Chronicle stopped safely/);
  const reportDir = path.join(appData, "PawOS", "Chronicle", "reports");
  const files = await (await import("node:fs/promises")).readdir(reportDir);
  assert.equal(files.filter(file => file.endsWith(".json")).length, 2);
  assert.equal(files.filter(file => file.startsWith("developer-") && file.endsWith(".html")).length, 1);
});

