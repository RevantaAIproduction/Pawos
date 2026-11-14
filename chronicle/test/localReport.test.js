import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLocalEventStream, stableLocalProjectId } from "../src/storage/localStore.js";
import { approveExactProjectFile, approveExactSource } from "../src/discovery/consent.js";
import { renderLocalReport } from "../src/report/renderHtml.js";

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
  const report = JSON.parse(reportText);
  assert.equal(report.schemaVersion, 8);
  assert.equal(report.developerProfile.schemaVersion, 1);
  assert.match(htmlText, /SOURCE COVERAGE/);
  assert.match(htmlText, /DEVELOPER PROFILE/);
  assert.ok(Array.isArray(report.episodes));
  assert.ok(Array.isArray(report.behavioralAnalysis.observations));
  assert.ok(report.behavioralAnalysis.evidenceCoverage);
  assert.ok(report.unassignedActivity);
  assert.ok(Array.isArray(report.engineeringOutcomes));
  assert.ok(report.engineeringOutcomeCoverage);
  assert.match(htmlText, /ENGINEERING OUTCOMES/);
  const truncated = structuredClone(report);
  truncated.git.historyTruncated = true;
  truncated.agents.sessions.push({ source: "codex", startedAt: null, durationSeconds: null, planningSignals: 0, correctionSignals: 0, toolKinds: [], failureSignals: 0, recoverySignals: 0, userTurns: 0, toolCallCount: 0, models: [], events: [], timelineAnalysis: null, sequenceSummary: { truncated: true } });
  assert.match(renderLocalReport(truncated), /Outcome counts and coverage above describe retained records only/);
  assert.equal(Object.hasOwn(report.git, "episodeCommitEvidence"), false);
  assert.match(htmlText, /ENGINEERING JOURNEY · WORK EPISODES/);
  assert.match(htmlText, /DEVELOPER INTELLIGENCE · EVIDENCE-BASED OBSERVATIONS/);
  for (const secret of ["DO_NOT_UPLOAD_SOURCE", "DO_NOT_UPLOAD_MESSAGE", "dev@example.test", project]) {
    assert.equal(reportText.includes(secret), false);
    assert.equal(htmlText.includes(secret), false);
  }
});

test("parent directory cancellation exits cleanly without reading history", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-parent-select-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const parent = path.join(temp, "repositories"); const project = path.join(parent, "project");
  await mkdir(project, { recursive: true }); git(project, "init", "-q");
  const child = spawnSync(process.execPath, [cli], { cwd: parent, input: "\n", encoding: "utf8", env: { ...process.env, ...dataEnv(temp), GIT_CONFIG_NOSYSTEM: "1" }, timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Scan canceled\. No Git history or session contents were read/);
});

test("CLI reuses explicit source consent and includes the deduplicated approved session", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-consented-report-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "PawOS"); await mkdir(project); git(project, "init", "-q");
  await writeFile(path.join(project, "README.md"), "project\n"); git(project, "add", "README.md");
  git(project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture");
  const home = path.join(temp, "home");
  const appData = path.join(temp, "Local App Data");
  const claudeRoot = path.join(home, ".claude", "projects", "PawOS"); await mkdir(claudeRoot, { recursive: true });
  await writeFile(path.join(claudeRoot, "session.jsonl"), [
    { type: "user", sessionId: "approved-session", cwd: project, timestamp: "2026-11-10T10:00:00Z", message: { content: "Implement the report." } },
    { type: "assistant", sessionId: "approved-session", cwd: project, timestamp: "2026-11-10T10:01:00Z", message: { model: "claude-sonnet-4-5", content: "Done." } },
  ].map(JSON.stringify).join("\n"));
  const env = { ...process.env, LOCALAPPDATA: appData, USERPROFILE: home, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
  const prior = { LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.LOCALAPPDATA = appData; process.env.USERPROFILE = home; process.env.HOME = home;
  try {
    await approveExactSource(path.join(home, ".claude", "projects"), "claude-code", project, await stableLocalProjectId(project));
  } finally {
    for (const key of Object.keys(prior)) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
  const defaultRun = spawnSync(process.execPath, [cli, "report"], { cwd: project, encoding: "utf8", env, timeout: 30_000 });
  assert.equal(defaultRun.status, 0, defaultRun.stderr);
  assert.match(defaultRun.stdout, /External agent stores were not checked/);
  assert.match(defaultRun.stdout, /0 unique approved session\(s\) included/);
  const folder = path.join(appData, "PawOS", "Chronicle", "reports");
  const defaultFiles = await readdir(folder);
  const defaultReports = await Promise.all(defaultFiles.filter(file => file.endsWith(".json")).map(async file => JSON.parse(await readFile(path.join(folder, file), "utf8"))));
  const defaultReport = defaultReports.find(report => report.agents.sessions.length === 0);
  assert.ok(defaultReport, "default run must not read the already-approved external source");
  const child = spawnSync(process.execPath, [cli, "report", "--include-external"], { cwd: project, encoding: "utf8", env, timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /1 unique approved session\(s\) included/);
  assert.match(child.stdout, /Completed: 1 report\(s\) saved; 0 selected project\(s\) unsuccessful/);
  assert.doesNotMatch(child.stdout + child.stderr, /Approve source numbers|Chronicle stopped safely/);
  const files = await readdir(folder);
  const reports = await Promise.all(files.filter(file => file.endsWith(".json")).map(async file => JSON.parse(await readFile(path.join(folder, file), "utf8"))));
  const report = reports.find(candidate => candidate.agents.sessions.length === 1);
  assert.ok(report, "explicit external-source run should include the approved session");
  assert.equal(report.agents.sessions.length, 1);
  assert.equal(JSON.stringify(report).includes("Implement the report."), false);
  assert.ok(report.agents.sessions[0].sequenceSummary);
  assert.equal(Object.hasOwn(report.agents.sessions[0], "events"), false);
  assert.equal(report.episodes.length, 0);
  assert.equal(report.unassignedActivity.sessionRefs.length, 1);
  const previous = { LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.LOCALAPPDATA = appData; process.env.USERPROFILE = home; process.env.HOME = home;
  let eventStream;
  try { eventStream = await loadLocalEventStream(report.reportId); }
  finally { for (const key of Object.keys(previous)) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  assert.ok(eventStream);
  assert.ok(eventStream.eventCount > 0);
  assert.equal(JSON.stringify(eventStream).includes("Implement the report."), false);
  assert.ok(eventStream.sessions[0].events.every((event) => event.sessionId === report.agents.sessions[0].sessionKey));
});

test("CLI only reads project-local Aider history after exact-file consent and creates a schema-v8 report", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-aider-cli-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "Aider Project"); await mkdir(project); git(project, "init", "-q");
  await writeFile(path.join(project, "README.md"), "project\n"); git(project, "add", "README.md");
  git(project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture");
  const historyPath = path.join(project, ".aider.chat.history.md");
  const fixture = await readFile(path.join(packageRoot, "test", "fixtures-aider-history.md"), "utf8");
  await writeFile(historyPath, fixture);
  const home = path.join(temp, "home"), appData = path.join(temp, "Local App Data");
  const env = { ...process.env, LOCALAPPDATA: appData, USERPROFILE: home, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };

  const unapprovedRun = spawnSync(process.execPath, [cli, "report"], { cwd: project, encoding: "utf8", env, timeout: 30_000 });
  assert.equal(unapprovedRun.status, 0, unapprovedRun.stderr);
  assert.match(unapprovedRun.stdout, /Aider history was not read without prior exact-file approval/);
  const reportFolder = path.join(appData, "PawOS", "Chronicle", "reports");
  const firstFiles = await readdir(reportFolder);
  const firstReport = JSON.parse(await readFile(path.join(reportFolder, firstFiles.find(name => name.endsWith(".json"))), "utf8"));
  assert.equal(firstReport.agents.sessions.length, 0);

  const prior = { LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.LOCALAPPDATA = appData; process.env.USERPROFILE = home; process.env.HOME = home;
  try { await approveExactProjectFile(historyPath, "aider", project, await stableLocalProjectId(project)); }
  finally { for (const key of Object.keys(prior)) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }

  const approvedRun = spawnSync(process.execPath, [cli, "report"], { cwd: project, encoding: "utf8", env, timeout: 30_000 });
  assert.equal(approvedRun.status, 0, approvedRun.stderr);
  assert.match(approvedRun.stdout, /Aider project history for Aider Project: 1 file read; 2 session\(s\) analyzed/);
  const secondFiles = await readdir(reportFolder);
  const reports = await Promise.all(secondFiles.filter(name => name.endsWith(".json")).map(async name => JSON.parse(await readFile(path.join(reportFolder, name), "utf8"))));
  const report = reports.find(item => item.agents.sessions.length === 2);
  assert.ok(report);
  assert.equal(report.schemaVersion, 8);
  assert.equal(report.sourceInventory.projectLocalSources.find(item => item.sourceId === "aider").inspectionStatus, "parsed");
  assert.equal(report.developerProfile.schemaVersion, 1);
  assert.ok(report.agents.sessions.every(item => item.source === "aider"));
  assert.equal(report.agents.sourceCoverage[0].adapterId, "aider");
  assert.equal(report.agents.sourceCoverage[0].filesRead, 1);
  for (const raw of ["Add a privacy-safe export summary.", "Applied edit to src/report.js", project]) assert.equal(JSON.stringify(report).includes(raw), false);
});
