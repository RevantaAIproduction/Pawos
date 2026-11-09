import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderLauncher } from "../scripts/render-launcher.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(packageRoot, "scripts", "launcher.template.sh");
const bashPath = path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe");
const tarPath = path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function runAsync(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), options.timeout || 30_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout, stderr }); });
  });
}

test("release renderer embeds immutable app version, URL, and SHA-256", async () => {
  const rendered = renderLauncher(await readFile(templatePath, "utf8"), "0.1.0", "a".repeat(64));
  assert.ok(rendered.includes("APP_VERSION='0.1.0'"));
  assert.ok(rendered.includes("APP_SHA256='" + "a".repeat(64) + "'"));
  assert.ok(rendered.includes("https://pawos.revantaai.com/chronicle/releases/v0.1.0/chronicle-0.1.0.tar.gz"));
  assert.ok(rendered.includes("NODE_VERSION='v24.22.2'"));
  assert.ok(!/@[A-Z_]+@/.test(rendered));
});

test("Git Bash launcher preserves project paths, verifies pins, and reuses its private cache", async t => {
  if (process.platform !== "win32") return t.skip("Windows Git Bash launcher test");
  try { await readFile(bashPath); await readFile(tarPath); } catch { return t.skip("Git for Windows tools are unavailable"); }
  const temp = await mkdtemp(path.join(os.tmpdir(), "Chronicle Launcher Fixture "));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const webRoot = path.join(temp, "fixture server");
  const releaseRoot = path.join(temp, "release files");
  const project = path.join(temp, "project with spaces");
  const cache = path.join(temp, "Local App Data");
  for (const dir of [webRoot, releaseRoot, project, cache]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(project, "package.json"), JSON.stringify({ scripts: { test: "echo SHOULD_NOT_RUN" } }));
  await writeFile(path.join(project, "project sentinel.txt"), "must remain unchanged\n");
  const runtimePath = process.execPath;
  const runtimeBytes = await readFile(runtimePath);
  const fixtureNode = path.join(releaseRoot, "node.exe");
  await copyFile(runtimePath, fixtureNode);
  const archive = path.join(releaseRoot, "chronicle-test.tar.gz");
  const tar = spawnSync(tarPath, ["-czf", archive, "-C", packageRoot, "src"], { encoding: "utf8", timeout: 15000 });
  assert.equal(tar.status, 0, tar.stderr);
  const appBytes = await readFile(archive);
  const hashes = { node: sha256(runtimeBytes), app: sha256(appBytes) };
  const hits = { node: 0, app: 0 };
  const server = createServer((req, res) => {
    const key = req.url === "/node.exe" ? "node" : req.url === "/chronicle.tar.gz" ? "app" : null;
    if (!key) { res.writeHead(404).end(); return; }
    hits[key]++;
    res.writeHead(200, { "content-length": String(key === "node" ? runtimeBytes.length : appBytes.length) });
    res.end(key === "node" ? runtimeBytes : appBytes);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  let script = await readFile(templatePath, "utf8");
  const values = {
    "@APP_VERSION@": "test-0.0.1", "@APP_SHA256@": hashes.app,
    "@APP_URL@": `${base}/chronicle.tar.gz`,
    "NODE_VERSION='v24.22.2'": "NODE_VERSION='fixture-node'",
    "NODE_SHA256='1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9'": `NODE_SHA256='${hashes.node}'`,
    "NODE_URL='https://nodejs.org/dist/v24.22.2/win-x64/node.exe'": `NODE_URL='${base}/node.exe'`
  };
  for (const [token, value] of Object.entries(values)) script = script.replaceAll(token, value);
  assert.ok(!/@[A-Z_]+@/.test(script), "template values must all be replaced");
  const launcher = path.join(temp, "launcher with spaces.sh");
  await writeFile(launcher, script, { mode: 0o700 });
  const env = { ...process.env, LOCALAPPDATA: cache };
  const first = await runAsync(bashPath, [launcher, "preview"], { cwd: project, env, encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout.trim());
  assert.equal(result.mode, "local_only");
  assert.equal(result.project.projectRoot.toLowerCase(), project.toLowerCase());
  assert.equal(result.consent.externalContentsRead, false);
  assert.deepEqual(hits, { node: 1, app: 1 });
  assert.equal(await readFile(path.join(project, "project sentinel.txt"), "utf8"), "must remain unchanged\n");
  const second = await runAsync(bashPath, [launcher, "preview"], { cwd: project, env, encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(hits, { node: 1, app: 1 }, "verified runtime and archive should be reused without downloads");
});

test("Git Bash launcher rejects a bad artifact checksum before execution", async t => {
  if (process.platform !== "win32") return t.skip("Windows Git Bash launcher test");
  try { await readFile(bashPath); } catch { return t.skip("Git for Windows tools are unavailable"); }
  const temp = await mkdtemp(path.join(os.tmpdir(), "Chronicle Bad Hash "));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const cache = path.join(temp, "Local App Data"); await mkdir(cache, { recursive: true });
  const project = path.join(temp, "sample project"); await mkdir(project, { recursive: true });
  const runtime = await readFile(process.execPath);
  const server = createServer((req, res) => {
    if (req.url === "/node.exe") res.end(runtime);
    else res.end("not an app archive");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  let script = await readFile(templatePath, "utf8");
  const values = { "@APP_VERSION@": "bad-test", "@APP_SHA256@": "1".repeat(64), "@APP_URL@": `${base}/app.tar.gz`, "NODE_VERSION='v24.22.2'": "NODE_VERSION='fixture-node'", "NODE_SHA256='1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9'": `NODE_SHA256='${sha256(runtime)}'`, "NODE_URL='https://nodejs.org/dist/v24.22.2/win-x64/node.exe'": `NODE_URL='${base}/node.exe'` };
  for (const [token, value] of Object.entries(values)) script = script.replaceAll(token, value);
  const launcher = path.join(temp, "bad-checksum.sh"); await writeFile(launcher, script);
  const result = await runAsync(bashPath, [launcher], { cwd: project, env: { ...process.env, LOCALAPPDATA: cache }, encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed its SHA-256 check/);
  assert.equal(result.stdout, "", "Chronicle must not start after app bundle verification fails");
});
