import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeApprovedAiderProjectFile, parseAiderChatHistory } from "../src/adapters/sessions.js";
import { approveExactProjectFile, hasExactSourceGrant } from "../src/discovery/consent.js";
import { validateSessionEvent } from "../src/domain/sessionEvent.js";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures-aider-history.md");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });

test("Aider Markdown fixture preserves ordered turns and session boundaries without inventing tools or models", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-aider-format-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, "repo"); await mkdir(project);
  const historyPath = path.join(project, ".aider.chat.history.md");
  const source = await readFile(fixturePath, "utf8"); await writeFile(historyPath, source);
  const first = parseAiderChatHistory(source, historyPath, project, { projectId: "a".repeat(64), repositoryIdentity: "test-repo" });
  const second = parseAiderChatHistory(source, historyPath, project, { projectId: "a".repeat(64), repositoryIdentity: "test-repo" });
  assert.equal(first.length, 2);
  assert.deepEqual(first.map(item => item.sessionKey), second.map(item => item.sessionKey));
  assert.equal(first[0].userTurns, 2);
  assert.equal(first[0].assistantTurns, 2);
  assert.deepEqual(first[0].events.map(item => item.type), ["session_start", "user_prompt", "assistant_response", "user_prompt", "assistant_response", "session_end"]);
  assert.deepEqual(first[0].events.map(item => item.sequence), [0, 1, 2, 3, 4, 5]);
  assert.equal(first[0].models.length, 0);
  assert.equal(first[0].toolCallCount, 0);
  assert.ok(first[0].events.every(item => item.timestamp === null));
  assert.equal(Object.hasOwn(first[0], "sourceFormatLimitations"), false, "format limitations are presented by Chronicle UI without widening the schema-v6 session object");
  const safe = JSON.stringify(first);
  for (const raw of ["Add a privacy-safe export summary.", "I will inspect the existing report flow", "Applied edit to src/report.js"]) assert.equal(safe.includes(raw), false);
});

test("Aider parser accepts a legacy marker-free single history but rejects out-of-project and malformed input", () => {
  const root = path.resolve(os.tmpdir(), "chronicle-aider-scope");
  const historyPath = path.join(root, ".aider.chat.history.md");
  const legacy = "#### Explain this change.\n\nThe output is recorded.\n";
  const parsed = parseAiderChatHistory(legacy, historyPath, root);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].userTurns, 1);
  assert.deepEqual(parseAiderChatHistory("no recognized user markers", historyPath, root), []);
  assert.deepEqual(parseAiderChatHistory(legacy, path.join(path.dirname(root), ".aider.chat.history.md"), root), []);
});

test("Aider preserves long CRLF and Unicode conversations, multiline prompts, and duplicate turns in source order", () => {
  const root = path.resolve(os.tmpdir(), "chronicle-aider-long");
  const historyPath = path.join(root, ".aider.chat.history.md");
  const rows = ["# aider chat started at 2026-02-28 09:10:11"];
  for (let index = 0; index < 1510; index++) {
    rows.push(`#### Repeated request ${index % 2}: explain 🐾`, "#### Include a second line and café text.", `Response number ${index} — done.`);
  }
  const sessions = parseAiderChatHistory(rows.join("\r\n"), historyPath, root, { projectId: "d".repeat(64) });
  assert.equal(sessions.length, 1);
  const session = sessions[0];
  assert.equal(session.userTurns, 1510);
  assert.equal(session.assistantTurns, 1510);
  assert.equal(session.events.length, 3000);
  assert.equal(session.timelineAnalysis.truncated, true, "the normalized event cap must be visible as truncated coverage");
  assert.deepEqual(session.events.slice(1, 5).map((event) => event.type), ["user_prompt", "assistant_response", "user_prompt", "assistant_response"]);
  assert.deepEqual(session.events.map((event) => event.sequence), Array.from({ length: 3000 }, (_, index) => index));
  assert.ok(session.events.every((event) => validateSessionEvent(event).ok));
  assert.equal(session.events[1].timestamp, null, "Aider's file does not provide per-turn timestamps");
  assert.match(session.events[1].provenance.recordReference, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(session).includes("Repeated request"));
  assert.ok(!JSON.stringify(session).includes("café"));
});

test("Aider keeps an interrupted final turn incomplete and rejects impossible session dates as boundaries", () => {
  const root = path.resolve(os.tmpdir(), "chronicle-aider-interrupted");
  const historyPath = path.join(root, ".aider.chat.history.md");
  const history = [
    "# aider chat started at 2026-02-28 09:10:11",
    "#### First request",
    "Assistant response one.",
    "# aider chat started at 2026-02-30 09:10:11",
    "#### Another request in the same conversation",
    "Assistant response two.",
    "# aider chat started at 2026-03-01 09:10:11",
    "#### Final request was interrupted",
  ].join("\n");
  const sessions = parseAiderChatHistory(history, historyPath, root);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].userTurns, 2);
  assert.equal(sessions[1].userTurns, 1);
  assert.equal(sessions[1].assistantTurns, 0);
  assert.equal(sessions[1].events.at(-1).type, "session_end");
  assert.equal(sessions[1].events.at(-1).outcome, "unknown");
  assert.equal(sessions[1].events.at(-1).confidence, "low");
  assert.ok(sessions.every((session) => session.startedAt === null && session.endedAt === null));
});

test("Aider does not deduplicate repeated prompts without stable source event IDs", () => {
  const root = path.resolve(os.tmpdir(), "chronicle-aider-duplicates");
  const historyPath = path.join(root, ".aider.chat.history.md");
  const source = "# aider chat started at 2026-01-01 00:00:00\n#### Repeat this request\nAnswer.\n#### Repeat this request\nAnswer.\n";
  const [session] = parseAiderChatHistory(source, historyPath, root);
  assert.equal(session.userTurns, 2);
  assert.equal(session.assistantTurns, 2);
  assert.equal(new Set(session.events.map((event) => event.eventId)).size, session.events.length);
});

test("Aider project history requires exact per-project file consent before reading", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-aider-consent-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const appData = path.join(temp, "app-data"), home = path.join(temp, "home");
  const prior = { LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.LOCALAPPDATA = appData; process.env.USERPROFILE = home; process.env.HOME = home;
  try {
    const project = path.join(temp, "project"); await mkdir(project); git(project, "init", "-q");
    const historyPath = path.join(project, ".aider.chat.history.md");
    await writeFile(historyPath, await readFile(fixturePath, "utf8"));
    const source = { path: historyPath, sourceId: "aider", adapterId: "aider" };
    const projectId = "b".repeat(64);
    await assert.rejects(analyzeApprovedAiderProjectFile(source, project, { projectId }), /aider_source_consent_required/);
    await approveExactProjectFile(historyPath, source.sourceId, project, projectId);
    assert.equal(await hasExactSourceGrant(historyPath, source.sourceId, projectId, project), true);
    assert.equal(await hasExactSourceGrant(historyPath, source.sourceId, "c".repeat(64), project), false);
    const result = await analyzeApprovedAiderProjectFile(source, project, { projectId });
    assert.equal(result.filesRead, 1);
    assert.equal(result.matched, 2);
    assert.equal(result.adapterId, "aider");
    assert.equal(JSON.stringify(result).includes("Add a privacy-safe export summary."), false);
  } finally {
    for (const key of Object.keys(prior)) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
});
