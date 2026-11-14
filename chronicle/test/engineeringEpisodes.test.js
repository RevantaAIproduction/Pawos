import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildEngineeringEpisodes } from "../src/analysis/engineeringEpisodes.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const projectId = hash("episode-fixture-project");
const worktreeA = hash("worktree-a");
const worktreeB = hash("worktree-b");
const event = (sessionKey, sequence, type, extra = {}) => ({
  schemaVersion: 1, eventId: hash(`${sessionKey}:${sequence}:${type}`), sessionId: sessionKey,
  sourceAdapter: "claude-code", sourceAdapterVersion: "2", sequence, sourceSequence: sequence,
  timestamp: null, timestampPrecision: "unknown", type, actor: type === "user_prompt" ? "user" : "assistant",
  toolIdentity: type === "tool_call" ? "Edit" : null, toolCategory: type === "tool_call" ? "file_edit" : null,
  parentEventId: null, parentSessionId: null, relationshipId: null, modelIdentifier: null,
  repositoryIdentity: projectId, worktreeIdentity: worktreeA, signals: [], outcome: "none",
  attribution: "observed", confidence: "high", provenance: { recordType: "fixture", recordReference: hash(`record:${sequence}`) }, ...extra,
});
function session(name, { source = "claude-code", task = null, branch = null, files = [], parent = null, related = [], times = [null, null], coherent = true, worktree = worktreeA } = {}) {
  const sessionKey = hash(name);
  const events = coherent ? [event(sessionKey, 0, "user_prompt"), event(sessionKey, 1, "tool_call", { toolCategory: "file_edit", worktreeIdentity: worktree })] : [event(sessionKey, 0, "assistant_response", { worktreeIdentity: worktree })];
  if (parent) events[0].parentSessionId = parent;
  return { sessionKey, source, startedAt: times[0], endedAt: times[1], events, taskReferenceHashes: task ? [task] : [], branchIdentity: branch, fileReferenceHashes: files, relatedCommitReferences: [], explicitRelatedSessionIds: related, sequenceSummary: { initialIntent: "change" } };
}
function report(sessions, episodeCommitEvidence = []) {
  return { project: { localProjectId: projectId }, agents: { sessions }, git: { episodeCommitEvidence } };
}

test("groups multiple sessions for one explicitly referenced task", () => {
  const episodes = buildEngineeringEpisodes(report([session("claude-a", { task: hash("issue-104") }), session("claude-b", { task: hash("issue-104") })]));
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].sessionRefs.length, 2);
  assert.ok(episodes[0].groupingBasis.includes("shared_explicit_task_reference"));
});

test("groups Claude and Codex sessions only on a shared explicit task reference", () => {
  const episodes = buildEngineeringEpisodes(report([session("claude-cross", { task: hash("task-cross") }), session("codex-cross", { source: "codex", task: hash("task-cross") })]));
  assert.equal(episodes.length, 1);
  assert.deepEqual(episodes[0].participatingAgentTypes, ["claude-code", "codex"]);
});

test("groups explicit parent and child sessions", () => {
  const parent = session("parent-session");
  const child = session("child-session", { source: "codex", parent: parent.sessionKey });
  const episodes = buildEngineeringEpisodes(report([parent, child]));
  assert.equal(episodes.length, 1);
  assert.ok(episodes[0].groupingBasis.includes("explicit_session_parent_link"));
});

test("groups sessions only when an adapter explicitly records agent-to-agent delegation", () => {
  const sender = session("delegating-session", { source: "codex" });
  const receiver = session("delegated-session", { source: "codex" });
  sender.explicitRelatedSessionIds = [receiver.sessionKey];
  const episodes = buildEngineeringEpisodes(report([sender, receiver]));
  assert.equal(episodes.length, 1);
  assert.ok(episodes[0].groupingBasis.includes("explicit_inter_agent_relationship"));
});

test("keeps unrelated sessions separate even when timestamps are close", () => {
  const episodes = buildEngineeringEpisodes(report([
    session("near-a", { times: ["2026-11-10T10:00:00.000Z", "2026-11-10T10:01:00.000Z"] }),
    session("near-b", { source: "codex", times: ["2026-11-10T10:01:01.000Z", "2026-11-10T10:02:00.000Z"] }),
  ]));
  assert.equal(episodes.length, 2);
  assert.ok(episodes.every((episode) => episode.sessionRefs.length === 1));
});

test("a shared branch without file or task evidence does not merge distinct tasks", () => {
  const episodes = buildEngineeringEpisodes(report([
    session("branch-task-a", { branch: hash("feature-branch"), files: [hash("file-a")] }),
    session("branch-task-b", { source: "codex", branch: hash("feature-branch"), files: [hash("file-b")] }),
  ]));
  assert.equal(episodes.length, 2);
});

test("groups explicitly linked work across distinct worktrees of the same repository", () => {
  const left = session("worktree-left", { task: hash("same-task"), worktree: worktreeA });
  const right = session("worktree-right", { task: hash("same-task"), worktree: worktreeB });
  const episodes = buildEngineeringEpisodes(report([left, right]));
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].sessionRefs.length, 2);
});

test("creates a session-only episode for a supported prompt-to-tool sequence", () => {
  const episodes = buildEngineeringEpisodes(report([session("local-only")]));
  assert.equal(episodes.length, 1);
  assert.deepEqual(episodes[0].gitCommitRefs, []);
});

test("leaves Git commits without attributable sessions ungrouped", () => {
  const commit = { commitId: hash("commit-alone"), timestamp: "2026-11-10T10:00:00Z", fileReferenceHashes: [hash("file-a")], fileCategories: ["implementation"], commitReferenceHashes: [] };
  assert.deepEqual(buildEngineeringEpisodes(report([], [commit])), []);
});

test("duplicate session references do not inflate an episode", () => {
  const same = session("duplicate-session", { task: hash("duplicate-task") });
  const episodes = buildEngineeringEpisodes(report([same, structuredClone(same)]));
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].sessionRefs.length, 1);
});

test("completion remains unknown even when a tool call succeeds", () => {
  const doneTool = session("success-is-not-task-completion");
  doneTool.events[1].outcome = "success";
  const episodes = buildEngineeringEpisodes(report([doneTool]));
  assert.equal(episodes[0].completionStatus, "unknown");
});

test("groups a session with Git commits using explicit commit metadata", () => {
  const shortRef = hash(`${projectId}\0commit-prefix\0abcdef0`);
  const sessionWithCommit = session("commit-link", { task: hash("task-with-commit") });
  sessionWithCommit.relatedCommitReferences = [shortRef];
  const commit = { commitId: hash("commit-1"), timestamp: "2026-11-10T10:00:00Z", fileReferenceHashes: [], fileCategories: ["test"], commitReferenceHashes: [shortRef] };
  const episodes = buildEngineeringEpisodes(report([sessionWithCommit], [commit]));
  assert.equal(episodes.length, 1);
  assert.deepEqual(episodes[0].gitCommitRefs, [commit.commitId]);
  assert.ok(episodes[0].changedFileCategories.includes("test"));
});

test("two or more shared file references plus the same branch corroborate session grouping", () => {
  const sharedFiles = [hash("shared-a"), hash("shared-b")];
  const episodes = buildEngineeringEpisodes(report([
    session("file-overlap-a", { branch: hash("branch"), files: sharedFiles }),
    session("file-overlap-b", { source: "codex", branch: hash("branch"), files: sharedFiles }),
  ]));
  assert.equal(episodes.length, 1);
  assert.ok(episodes[0].groupingBasis.includes("same_explicit_branch_and_multiple_file_references"));
});

test("sessions with only timestamps and no task sequence remain ungrouped", () => {
  const episodes = buildEngineeringEpisodes(report([
    session("ambiguous-a", { coherent: false, times: ["2026-11-10T10:00:00Z", "2026-11-10T10:01:00Z"] }),
    session("ambiguous-b", { coherent: false, source: "gemini-cli", times: ["2026-11-10T10:00:30Z", "2026-11-10T10:01:30Z"] }),
  ]));
  assert.deepEqual(episodes, []);
});
