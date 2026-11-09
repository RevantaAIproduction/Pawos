import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { analyzeApprovedSessionSource, previewSessionSource, supportedSessionSources } from "../src/adapters/sessions.js";

async function setup(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), "chronicle-adapters-"));
  const project = path.join(home, "sample project");
  await mkdir(project);
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, project };
}

test("Claude Code JSONL adapter extracts only privacy-safe session signals after consent", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".claude", "projects", "encoded");
  await mkdir(source, { recursive: true });
  const rows = [
    { type: "user", uuid: "u1", sessionId: "claude-session-id", cwd: project, timestamp: "2026-11-08T10:00:00.000Z", message: { role: "user", content: "Plan the implementation safely. PRIVATE_PROMPT_SENTINEL" } },
    { type: "assistant", uuid: "a1", sessionId: "claude-session-id", cwd: project, timestamp: "2026-11-08T10:04:00.000Z", message: { role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text: "PRIVATE_RESPONSE_SENTINEL" }, { type: "tool_use", name: "Bash" }] } },
  ];
  await writeFile(path.join(source, "session.jsonl"), rows.map(JSON.stringify).join("\n"));
  const preview = await previewSessionSource({ sourceId: "claude-code", adapterId: "claude-code", path: path.dirname(source) });
  assert.equal(preview.sessionFiles, 1);
  assert.equal(preview.contentsInspected, undefined);
  const result = await analyzeApprovedSessionSource({ sourceId: "claude-code", adapterId: "claude-code", path: path.dirname(source) }, project);
  assert.equal(result.matched, 1, JSON.stringify(result));
  const session = result.sessions[0];
  assert.equal(session.userTurns, 1);
  assert.equal(session.assistantTurns, 1);
  assert.equal(session.durationSeconds, 240);
  assert.equal(session.planningSignals, 1);
  assert.equal(session.toolKinds[0], "shell");
  assert.equal(session.models[0], "claude-sonnet-4-5");
  assert.equal(JSON.stringify(session).includes("PRIVATE_PROMPT_SENTINEL"), false);
  assert.equal(JSON.stringify(session).includes("PRIVATE_RESPONSE_SENTINEL"), false);
  assert.equal(JSON.stringify(session).includes(project), false);
  assert.equal(JSON.stringify(session).includes("claude-session-id"), false);
});

test("Codex CLI official rollout JSONL shape associates by session_meta cwd and avoids duplicate user events", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".codex", "sessions", "2026", "11", "08");
  await mkdir(source, { recursive: true });
  const rows = [
    { timestamp: "2026-11-08T10:00:00Z", type: "session_meta", payload: { meta: { id: "codex-private-id", cwd: project, timestamp: "2026-11-08T10:00:00Z", model_provider: "openai" } } },
    { timestamp: "2026-11-08T10:00:03Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Build the feature. CODEX_PRIVATE_PROMPT" }] } },
    { timestamp: "2026-11-08T10:00:03Z", type: "event_msg", payload: { type: "user_message", message: "Build the feature. CODEX_PRIVATE_PROMPT" } },
    { timestamp: "2026-11-08T10:01:00Z", type: "response_item", payload: { type: "function_call", name: "shell" } },
    { timestamp: "2026-11-08T10:03:00Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] } },
  ];
  await writeFile(path.join(source, "rollout-2026-11-08T10-00-00-id.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ sourceId: "codex", adapterId: "codex", path: path.join(home, ".codex", "sessions") }, project);
  assert.equal(result.matched, 1);
  assert.equal(result.sessions[0].userTurns, 1);
  assert.equal(result.sessions[0].toolCallCount, 1);
  assert.equal(result.sessions[0].durationSeconds, 180);
  assert.equal(JSON.stringify(result).includes("CODEX_PRIVATE_PROMPT"), false);
  assert.equal(JSON.stringify(result).includes(project), false);
});

test("Gemini CLI JSONL metadata and messages associate by project hash; unrelated project sessions are excluded", async (t) => {
  const { home, project } = await setup(t);
  const projectHash = createHash("sha256").update(await realpath(project)).digest("hex");
  const source = path.join(home, ".gemini", "tmp", projectHash, "chats");
  await mkdir(source, { recursive: true });
  const rows = [
    { sessionId: "gemini-private-id", projectHash, startTime: "2026-11-08T10:00:00Z", lastUpdated: "2026-11-08T10:05:00Z", kind: "main" },
    { id: "u1", timestamp: "2026-11-08T10:00:01Z", type: "user", content: [{ text: "Plan the work. GEMINI_PRIVATE_PROMPT" }] },
    { id: "m1", timestamp: "2026-11-08T10:01:00Z", type: "gemini", content: "GEMINI_PRIVATE_RESPONSE", model: "gemini-2.5-pro", toolCalls: [{ id: "t1", name: "write_file" }] },
  ];
  await writeFile(path.join(source, "session-2026-11-08T10-00-private.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ sourceId: "gemini-cli", adapterId: "gemini-cli", path: path.join(home, ".gemini", "tmp") }, project);
  assert.equal(result.matched, 1, JSON.stringify(result));
  assert.equal(result.sessions[0].source, "gemini-cli");
  assert.equal(result.sessions[0].planningSignals, 1);
  assert.equal(result.sessions[0].toolKinds[0], "file_edit");
  assert.equal(JSON.stringify(result).includes("GEMINI_PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes(project), false);
});

test("adapter locations are limited to known roots and obey explicit CODEX_HOME", () => {
  const locations = supportedSessionSources({ CODEX_HOME: "C:\\safe\\codex" }, "win32", "C:\\Users\\test");
  assert.equal(locations.some((item) => item.sourceId === "cursor"), false);
  assert.equal(locations.find((item) => item.sourceId === "codex").path, path.resolve("C:\\safe\\codex\\sessions"));
});
