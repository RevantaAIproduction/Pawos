import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(packageRoot, "src", "cli.js");
function git(root, ...args) { execFileSync("git", ["-C", root, ...args], { stdio: "ignore" }); }
function dataEnv(home) { return process.platform === "win32" ? { LOCALAPPDATA: path.join(home, "Local App Data") } : { XDG_DATA_HOME: path.join(home, "data") }; }

test("CLI creates a local HTML report and sanitized JSON from the selected project", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-local-report-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "sample repo with spaces"); await mkdir(project);
  git(project, "init", "-q");
  await writeFile(path.join(project, "secret.ts"), "const token = 'DO_NOT_UPLOAD_SOURCE';\n");
  git(project, "add", "secret.ts");
  git(project, "-c", "user.name=Developer", "-c", "user.email=dev@example.test", "commit", "-m", "DO_NOT_UPLOAD_MESSAGE");
  const child = spawnSync(process.execPath, [cli], { cwd: project, encoding: "utf8", env: { ...process.env, ...dataEnv(temp), GIT_CONFIG_NOSYSTEM: "1" }, timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Chronicle report created for sample repo with spaces/);
  const folder = path.join(dataEnv(temp).LOCALAPPDATA ?? dataEnv(temp).XDG_DATA_HOME, "PawOS", "Chronicle", "reports");
  const files = await readdir(folder);
  const jsonName = files.find((name) => name.endsWith(".json"));
  const htmlName = files.find((name) => name.endsWith(".html"));
  assert.ok(jsonName && htmlName);
  const reportText = await readFile(path.join(folder, jsonName), "utf8");
  const htmlText = await readFile(path.join(folder, htmlName), "utf8");
  for (const secret of ["DO_NOT_UPLOAD_SOURCE", "DO_NOT_UPLOAD_MESSAGE", "dev@example.test", project]) {
    assert.equal(reportText.includes(secret), false);
    assert.equal(htmlText.includes(secret), false);
  }
});

test("parent directory scan asks for repository selection even when one candidate exists", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-parent-select-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const parent = path.join(temp, "repositories"); const project = path.join(parent, "project");
  await mkdir(project, { recursive: true }); git(project, "init", "-q");
  const child = spawnSync(process.execPath, [cli], { cwd: parent, input: "\n", encoding: "utf8", env: { ...process.env, ...dataEnv(temp), GIT_CONFIG_NOSYSTEM: "1" }, timeout: 30_000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Scan canceled before reading Git history/);
});
