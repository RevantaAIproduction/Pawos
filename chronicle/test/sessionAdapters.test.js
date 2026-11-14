import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { analyzeApprovedSessionSource, previewSessionSource, supportedSessionSources } from "../src/adapters/sessions.js";
import { analyzeGitProject } from "../src/adapters/git.js";
import { attachSessionEvidence } from "../src/application/attachSessions.js";
import { createSessionEventNormalizer } from "../src/domain/sessionEvent.js";

async function setup(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), "chronicle-adapters-"));
  const project = path.join(home, "sample project");
  await mkdir(project);
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, project };
}

test("normalized event IDs deduplicate repeated source records and preserve order when timestamps are absent", () => {
  const normalizer = createSessionEventNormalizer({ adapterId: "codex", adapterVersion: "2", rawSessionId: "fixture-session", sessionKey: createHash("sha256").update("fixture-session").digest("hex"), repositoryIdentity: "fixture-repository", worktreePath: "C:/fixture/worktree" });
  const first = normalizer.add({ sourceSequence: 12, sourceRecordId: "record-12", sourceRecordType: "response_item.message", type: "user_prompt", actor: "user", attribution: "observed", confidence: "high" });
  const duplicate = normalizer.add({ sourceSequence: 12, sourceRecordId: "record-12", sourceRecordType: "response_item.message", type: "user_prompt", actor: "user", attribution: "observed", confidence: "high" });
  const second = normalizer.add({ sourceSequence: 20, sourceRecordId: "record-20", sourceRecordType: "response_item.function_call", type: "tool_call", actor: "tool", toolIdentity: "shell", attribution: "observed", confidence: "high" });
  assert.equal(first.eventId, duplicate.eventId);
  assert.deepEqual(normalizer.list().map((event) => [event.sequence, event.sourceSequence, event.timestamp]), [[0, 12, null], [1, 20, null]]);
  assert.ok(second.worktreeIdentity);
});

test("product-context wording is retained only as a heuristic event signal", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".claude", "projects", "encoded");
  await mkdir(source, { recursive: true });
  const privatePrompt = "PRIVATE_PRODUCT_FIXTURE customer workflow trade-off";
  await writeFile(path.join(source, "product.jsonl"), JSON.stringify({ type: "user", uuid: "product-u1", sessionId: "product-session", cwd: project, timestamp: "2026-11-08T10:00:00.000Z", message: { content: privatePrompt } }));
  const result = await analyzeApprovedSessionSource({ sourceId: "claude-code", adapterId: "claude-code", path: path.dirname(source) }, project);
  assert.equal(result.matched, 1);
  assert.ok(result.sessions[0].events.some((event) => event.type === "user_prompt" && event.signals.includes("product_context_language")));
  assert.equal(JSON.stringify(result).includes(privatePrompt), false);
});

test("Claude Code JSONL adapter extracts only privacy-safe session signals after consent", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".claude", "projects", "encoded");
  await mkdir(source, { recursive: true });
  const rows = [
    { type: "user", uuid: "u1", sessionId: "claude-session-id", cwd: project, timestamp: "2026-11-08T10:00:00.000Z", metadata: { issueId: "PAW-123", branchName: "feature/chronicle" }, message: { role: "user", content: "Plan the implementation safely. PRIVATE_PROMPT_SENTINEL" } },
    { type: "assistant", uuid: "a1", sessionId: "claude-session-id", cwd: project, timestamp: "2026-11-08T10:04:00.000Z", message: { role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text: "PRIVATE_RESPONSE_SENTINEL" }, { type: "tool_use", name: "Write", input: { file_path: path.join(project, "src", "app.js") } }] } },
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
  assert.equal(session.toolKinds[0], "file_edit");
  assert.equal(session.models[0], "claude-sonnet-4-5");
  assert.deepEqual(session.events.map((event) => event.type), ["session_start", "user_prompt", "assistant_response", "model_change", "tool_call", "session_end"]);
  assert.equal(session.events[0].schemaVersion, 1);
  assert.ok(session.events.every((event, index) => event.sequence === index));
  assert.equal(session.timelineAnalysis.initialIntent.classification, "plan");
  assert.equal(session.timelineAnalysis.planningBeforeFirstTool, true);
  assert.equal(session.timelineAnalysis.completionStatus, "not_observed");
  assert.ok(session.events.every((event) => event.repositoryIdentity && event.worktreeIdentity && event.provenance.recordReference));
  assert.equal(session.taskReferenceHashes.length, 1);
  assert.ok(session.branchIdentity);
  assert.equal(session.fileReferenceHashes.length, 1);
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
    { timestamp: "2026-11-08T10:00:00Z", type: "session_meta", payload: { meta: { id: "codex-private-id", cwd: project, timestamp: "2026-11-08T10:00:00Z", model_provider: "openai", task_id: "PAW-456", git_branch: "feature/chronicle" } } },
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
  assert.equal(result.sessions[0].taskReferenceHashes.length, 1);
  assert.ok(result.sessions[0].branchIdentity);
  assert.equal(result.sessions[0].durationSeconds, 180);
  assert.deepEqual(result.sessions[0].events.map((event) => event.type), ["session_start", "user_prompt", "tool_call", "assistant_response", "session_end"]);
  assert.equal(result.sessions[0].timelineAnalysis.initialIntent.classification, "change");
  assert.equal(result.sessions[0].timelineAnalysis.explicitCompletionEventId, null);
  assert.equal(JSON.stringify(result).includes("CODEX_PRIVATE_PROMPT"), false);
  assert.equal(JSON.stringify(result).includes(project), false);
});

test("explicit failure followed by explicit success is recorded as a recovery signal without retaining tool text", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".codex", "sessions", "2026", "11", "08");
  await mkdir(source, { recursive: true });
  const rows = [
    { timestamp: "2026-11-08T10:00:00Z", type: "session_meta", payload: { meta: { id: "recovery-session", cwd: project, timestamp: "2026-11-08T10:00:00Z" } } },
    { timestamp: "2026-11-08T10:01:00Z", type: "response_item", payload: { type: "function_call_output", is_error: true, output: "PRIVATE_FAILURE_OUTPUT" } },
    { timestamp: "2026-11-08T10:02:00Z", type: "response_item", payload: { type: "function_call_output", is_error: false, output: "PRIVATE_SUCCESS_OUTPUT" } },
  ];
  await writeFile(path.join(source, "rollout-recovery.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ sourceId: "codex", adapterId: "codex", path: path.join(home, ".codex", "sessions") }, project);
  assert.equal(result.sessions[0].failureSignals, 1);
  assert.equal(result.sessions[0].recoverySignals, 1);
  assert.equal(result.sessions[0].timelineAnalysis.failureToSuccessSequences.length, 1);
  assert.ok(result.sessions[0].events.some((event) => event.type === "recovery"));
  assert.equal(JSON.stringify(result).includes("PRIVATE_FAILURE_OUTPUT"), false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_SUCCESS_OUTPUT"), false);
});

test("Claude ordered events link corrections, agent dispatch, background execution, and returns without transcript text", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".claude", "projects", "encoded");
  await mkdir(source, { recursive: true });
  const rows = [
    { type: "user", uuid: "u1", sessionId: "ordered-claude", cwd: project, timestamp: "2026-11-08T10:00:00Z", message: { content: "Implement the approved change. PRIVATE_ORDERED_PROMPT" } },
    { type: "assistant", uuid: "a1", sessionId: "ordered-claude", cwd: project, timestamp: "2026-11-08T10:01:00Z", message: { model: "claude-sonnet-4-5", content: [{ type: "tool_use", id: "task-call-1", name: "Task", input: { run_in_background: true, agentId: "child-agent-1", prompt: "PRIVATE_SUBAGENT_PROMPT" } }] } },
    { type: "user", uuid: "u2", sessionId: "ordered-claude", cwd: project, timestamp: "2026-11-08T10:02:00Z", message: { content: [{ type: "tool_result", tool_use_id: "task-call-1", is_error: false, content: "PRIVATE_SUBAGENT_RESULT" }] } },
    { type: "user", uuid: "u3", sessionId: "ordered-claude", cwd: project, timestamp: "2026-11-08T10:03:00Z", message: { content: "Actually, use the other API. PRIVATE_CORRECTION" } },
    { type: "assistant", uuid: "a2", sessionId: "ordered-claude", cwd: project, timestamp: "2026-11-08T10:04:00Z", message: { content: [{ type: "text", text: "PRIVATE_AGENT_RESPONSE" }, { type: "tool_use", id: "write-call-2", name: "Write" }] } },
  ];
  await writeFile(path.join(source, "ordered-session.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ adapterId: "claude-code", sourceId: "claude-code", path: path.dirname(source) }, project);
  const session = result.sessions[0];
  const dispatch = session.events.find((event) => event.type === "subagent_dispatch");
  const returned = session.events.find((event) => event.type === "subagent_return");
  assert.ok(dispatch && returned);
  assert.equal(returned.parentEventId, dispatch.eventId);
  assert.ok(session.events.some((event) => event.type === "background_execution_start"));
  assert.ok(session.events.some((event) => event.type === "background_execution_end"));
  assert.equal(session.timelineAnalysis.correctionFollowUps.length, 1);
  assert.ok(session.timelineAnalysis.correctionFollowUps[0].followUpEventId);
  const serialized = JSON.stringify(session.events);
  for (const secret of ["PRIVATE_ORDERED_PROMPT", "PRIVATE_SUBAGENT_PROMPT", "PRIVATE_SUBAGENT_RESULT", "PRIVATE_CORRECTION", "PRIVATE_AGENT_RESPONSE", project, "task-call-1"]) assert.equal(serialized.includes(secret), false);
});

test("Codex child rollout records an opaque parent session relationship from session metadata", async (t) => {
  const { home, project } = await setup(t);
  const source = path.join(home, ".codex", "sessions", "2026", "11", "08");
  await mkdir(source, { recursive: true });
  const rows = [
    { timestamp: "2026-11-08T10:00:00Z", type: "session_meta", payload: { meta: { id: "codex-child", cwd: project, timestamp: "2026-11-08T10:00:00Z", parent_thread_id: "codex-parent", agent_role: "worker" } } },
    { timestamp: "2026-11-08T10:00:02Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "PRIVATE_CHILD_RESPONSE" }] } },
  ];
  await writeFile(path.join(source, "rollout-child.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ adapterId: "codex", sourceId: "codex", path: path.join(home, ".codex", "sessions") }, project);
  const dispatch = result.sessions[0].events.find((event) => event.type === "subagent_dispatch");
  assert.equal(dispatch.parentSessionId, createHash("sha256").update("codex\0codex-parent").digest("hex"));
  assert.equal(JSON.stringify(result).includes("codex-parent"), false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_CHILD_RESPONSE"), false);
});

test("explicit shared issue metadata links Claude Code and Codex sessions into one episode", async (t) => {
  const { home, project } = await setup(t);
  execFileSync("git", ["-C", project, "init", "-q"]);
  await writeFile(path.join(project, "README.md"), "sample\n");
  execFileSync("git", ["-C", project, "add", "README.md"]);
  execFileSync("git", ["-C", project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "sample"]);
  const claudeRoot = path.join(home, ".claude", "projects", "sample");
  const codexRoot = path.join(home, ".codex", "sessions", "2026", "11", "10");
  await mkdir(claudeRoot, { recursive: true }); await mkdir(codexRoot, { recursive: true });
  await writeFile(path.join(claudeRoot, "session.jsonl"), [
    { type: "user", uuid: "task-user", sessionId: "task-claude", cwd: project, metadata: { issueId: "PAW-222" }, message: { content: "Implement this work item." } },
    { type: "assistant", uuid: "task-tool", sessionId: "task-claude", cwd: project, message: { content: [{ type: "tool_use", id: "task-write", name: "Write", input: { file_path: "src/example.js" } }] } },
  ].map(JSON.stringify).join("\n"));
  await writeFile(path.join(codexRoot, "rollout-task.jsonl"), [
    { type: "session_meta", payload: { meta: { id: "task-codex", cwd: project, issue_id: "paw-222" } } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue the work item." }] } },
    { type: "response_item", payload: { type: "function_call", call_id: "codex-write", name: "write_file", arguments: JSON.stringify({ file_path: "src/example.js" }) } },
  ].map(JSON.stringify).join("\n"));
  const gitReport = await analyzeGitProject(project);
  const claude = await analyzeApprovedSessionSource({ adapterId: "claude-code", sourceId: "claude-code", path: path.join(home, ".claude", "projects") }, project, { projectId: gitReport.project.localProjectId });
  const codex = await analyzeApprovedSessionSource({ adapterId: "codex", sourceId: "codex", path: path.join(home, ".codex", "sessions") }, project, { projectId: gitReport.project.localProjectId });
  const combined = attachSessionEvidence(gitReport, [{ ...claude, sourceId: "claude-code", estimatedFiles: 1 }, { ...codex, sourceId: "codex", estimatedFiles: 1 }]);
  assert.equal(combined.agents.sessions.length, 2);
  assert.equal(combined.episodes.length, 1);
  assert.deepEqual(combined.episodes[0].participatingAgentTypes, ["claude-code", "codex"]);
  assert.ok(combined.episodes[0].groupingBasis.includes("shared_explicit_task_reference"));
  assert.equal(JSON.stringify(combined.episodes[0]).includes("PAW-222"), false);
});

test("Gemini CLI JSONL metadata and messages associate by project hash; unrelated project sessions are excluded", async (t) => {
  const { home, project } = await setup(t);
  const projectHash = createHash("sha256").update(await realpath(project)).digest("hex");
  const source = path.join(home, ".gemini", "tmp", projectHash, "chats");
  await mkdir(source, { recursive: true });
  const rows = [
    { sessionId: "gemini-private-id", projectHash, startTime: "2026-11-08T10:00:00Z", lastUpdated: "2026-11-08T10:05:00Z", kind: "main", issue_id: "PAW-789" },
    { id: "u1", type: "user", content: [{ text: "Plan the work. GEMINI_PRIVATE_PROMPT" }] },
    { id: "m1", type: "gemini", content: "GEMINI_PRIVATE_RESPONSE", model: "gemini-2.5-pro", toolCalls: [{ id: "t1", name: "write_file" }] },
  ];
  await writeFile(path.join(source, "session-2026-11-08T10-00-private.jsonl"), rows.map(JSON.stringify).join("\n"));
  const result = await analyzeApprovedSessionSource({ sourceId: "gemini-cli", adapterId: "gemini-cli", path: path.join(home, ".gemini", "tmp") }, project);
  assert.equal(result.matched, 1, JSON.stringify(result));
  assert.equal(result.sessions[0].source, "gemini-cli");
  assert.equal(result.sessions[0].taskReferenceHashes.length, 1);
  assert.equal(result.sessions[0].planningSignals, 1);
  assert.equal(result.sessions[0].toolKinds[0], "file_edit");
  assert.deepEqual(result.sessions[0].events.filter((event) => ["user_prompt", "assistant_response", "tool_call"].includes(event.type)).map((event) => event.type), ["user_prompt", "assistant_response", "tool_call"]);
  assert.ok(result.sessions[0].timelineAnalysis.missingTimestampCount >= 1);
  assert.ok(result.sessions[0].events.find((event) => event.type === "user_prompt").sequence < result.sessions[0].events.find((event) => event.type === "assistant_response").sequence);
  assert.equal(JSON.stringify(result).includes("GEMINI_PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes(project), false);
});

test("adapter locations are limited to known roots and obey explicit CODEX_HOME", () => {
  const locations = supportedSessionSources({ CODEX_HOME: "C:\\safe\\codex" }, "win32", "C:\\Users\\test");
  assert.equal(locations.some((item) => item.sourceId === "cursor"), false);
  assert.equal(locations.find((item) => item.sourceId === "codex").path, path.resolve("C:\\safe\\codex\\sessions"));
});

test("Claude worktree cwd and Codex cwd associate to the original repository and duplicate sessions collapse", async (t) => {
  const { home, project } = await setup(t);
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserProfile = process.env.USERPROFILE;
  const previousHome = process.env.HOME;
  process.env.LOCALAPPDATA = path.join(home, "app-data");
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  t.after(() => {
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousLocalAppData;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previousUserProfile;
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  });
  execFileSync("git", ["-C", project, "init", "-q"]);
  await writeFile(path.join(project, "README.md"), "project\n");
  execFileSync("git", ["-C", project, "add", "README.md"]);
  execFileSync("git", ["-C", project, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  const worktree = path.join(project, ".claude", "worktrees", "agent-session");
  await mkdir(path.dirname(worktree), { recursive: true });
  execFileSync("git", ["-C", project, "worktree", "add", "--detach", worktree, "HEAD"]);

  const claudeRoot = path.join(home, ".claude", "projects", "encoded-project");
  const codexRoot = path.join(home, ".codex", "sessions", "2026", "11", "10");
  await mkdir(claudeRoot, { recursive: true });
  await mkdir(codexRoot, { recursive: true });
  const claude = [
    { type: "user", sessionId: "stable-claude-session", cwd: worktree, timestamp: "2026-11-10T10:00:00Z", message: { content: "Work from the linked worktree." } },
    { type: "assistant", sessionId: "stable-claude-session", cwd: worktree, timestamp: "2026-11-10T10:02:00Z", message: { model: "claude-sonnet-4-5", content: [{ type: "tool_use", name: "Bash" }] } },
  ].map(JSON.stringify).join("\n");
  await writeFile(path.join(claudeRoot, "session-a.jsonl"), claude);
  await writeFile(path.join(claudeRoot, "duplicate-copy.jsonl"), claude.replaceAll(worktree, project));
  const codex = [
    { timestamp: "2026-11-10T11:00:00Z", type: "session_meta", payload: { meta: { id: "stable-codex-session", cwd: project, timestamp: "2026-11-10T11:00:00Z" } } },
    { timestamp: "2026-11-10T11:02:00Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Continue in original project." }] } },
  ].map(JSON.stringify).join("\n");
  await writeFile(path.join(codexRoot, "rollout-session.jsonl"), codex);

  const report = await analyzeGitProject(project);
  const claudeResult = await analyzeApprovedSessionSource({ adapterId: "claude-code", sourceId: "claude-code", path: path.dirname(claudeRoot) }, project);
  const codexResult = await analyzeApprovedSessionSource({ adapterId: "codex", sourceId: "codex", path: path.join(home, ".codex", "sessions") }, project);
  assert.equal(claudeResult.parsedRecords, 1);
  assert.equal(claudeResult.matched, 1);
  assert.equal(claudeResult.sessions.length, 1);
  assert.equal(claudeResult.sessions[0].association, "exact_root");
  assert.equal(codexResult.matched, 1);
  const attached = attachSessionEvidence(report, [claudeResult, codexResult]);
  assert.equal(attached.agents.sessions.length, 2);
  assert.equal(attached.agents.metrics.sessionCount, 2);
  assert.match(attached.developmentStory, /2 approved local agent sessions/);
  assert.match(attached.developmentStory, /does not establish authorship/);
  assert.deepEqual(attached.dimensions.map((dimension) => dimension.key), ["planning", "ai_steering", "execution_leverage", "engineering_quality", "product_thinking"]);
  assert.ok(attached.dimensions.every((dimension) => dimension.score === null));
  const claudeEvents = attached.agents.sessions.find((session) => session.source === "claude-code").events;
  const codexEvents = attached.agents.sessions.find((session) => session.source === "codex").events;
  assert.equal(claudeEvents[0].repositoryIdentity, codexEvents[0].repositoryIdentity);
  assert.notEqual(claudeEvents[0].worktreeIdentity, codexEvents[0].worktreeIdentity);
});
