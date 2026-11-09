import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { analyzeGitProject } from "../src/adapters/git.js";
import { renderLocalReport } from "../src/report/renderHtml.js";

test("Git report counts activity while leaving authorship unknown and source text out", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chronicle-sample-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = path.join(root, "local-app-data");
  t.after(() => { if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousLocalAppData; });
  execFileSync("git", ["init", "-q", root]);
  const tracked = path.join(root, "src"); await mkdir(tracked);
  await writeFile(path.join(tracked, "feature.ts"), "// PRIVATE_SOURCE_SENTINEL\nexport const value = 1;\n");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "Private Person", GIT_AUTHOR_EMAIL: "private@example.test", GIT_COMMITTER_NAME: "Private Person", GIT_COMMITTER_EMAIL: "private@example.test" } });
  git("add", "src/feature.ts");
  git("-c", "user.name=Private Person", "-c", "user.email=private@example.test", "commit", "-m", "PRIVATE_COMMIT_MESSAGE");
  await writeFile(path.join(tracked, "feature.ts"), "export const value = 2;\n");
  git("add", "src/feature.ts");
  git("-c", "user.name=Private Person", "-c", "user.email=private@example.test", "commit", "-m", "second change");

  const report = await analyzeGitProject(root);
  const repeat = await analyzeGitProject(root);
  const serialized = JSON.stringify(report);
  const html = renderLocalReport(report);
  assert.equal(report.git.commitCount, 2);
  assert.equal(report.project.localProjectId, repeat.project.localProjectId);
  assert.equal(report.git.authorship, "unknown");
  assert.equal(report.contribution.manual, "unknown");
  assert.equal(report.contribution.aiAssisted, "unknown");
  assert.equal(report.dimensions.every((item) => item.score === null), true);
  assert.ok(report.git.commitIds.every((id) => /^[0-9a-f]{64}$/.test(id)));
  for (const secret of ["PRIVATE_SOURCE_SENTINEL", "PRIVATE_COMMIT_MESSAGE", "Private Person", "private@example.test", root]) {
    assert.equal(serialized.includes(secret), false, `JSON leaked ${secret}`);
    assert.equal(html.includes(secret), false, `HTML leaked ${secret}`);
  }
});

test("Git report rejects linked worktrees whose metadata lives outside the selected root", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chronicle-linked-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, ".git"), "gitdir: ../outside\n");
  await assert.rejects(analyzeGitProject(root), /linked worktrees are not read/);
});
