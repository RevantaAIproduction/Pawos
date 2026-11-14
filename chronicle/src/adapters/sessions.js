import os from "node:os";
import path from "node:path";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inspectGitRepository } from "./gitRepository.js";
import { createSessionEventNormalizer, SESSION_EVENT_SCHEMA_VERSION } from "../domain/sessionEvent.js";
import { analyzeSessionTimeline, summarizeSessionTimeline } from "../analysis/sessionTimeline.js";
import { assertContainedNoLinks, assertSafeRoot } from "../discovery/safety.js";
import { hasExactSourceGrant } from "../discovery/consent.js";

export const MAX_SESSION_FILES = 5_000;
export const MAX_SESSION_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DEPTH = 12;
const ADAPTERS = {
  "claude-code": { version: "2", format: "Claude Code JSONL transcript (observed record schema)", parse: parseClaude },
  codex: { version: "2", format: "Codex rollout JSONL (session_meta / response_item / event_msg)", parse: parseCodex },
  "gemini-cli": { version: "2", format: "Gemini CLI conversation JSONL (ConversationRecord / message records)", parse: parseGemini },
  aider: { version: "1", format: "Aider project-local Markdown chat history (# aider chat started / #### user input)", parse: null },
};

export function supportedSessionSources(env = process.env, platform = process.platform, home = os.homedir()) {
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  const geminiHome = env.GEMINI_CLI_HOME || path.join(home, ".gemini");
  return [
    { adapterId: "claude-code", sourceId: "claude-code", path: path.join(home, ".claude", "projects"), location: "~/.claude/projects/<encoded-project-cwd>/*.jsonl" },
    { adapterId: "codex", sourceId: "codex", path: path.join(codexHome, "sessions"), location: "$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl" },
    { adapterId: "codex", sourceId: "codex-archived", path: path.join(codexHome, "archived_sessions"), location: "$CODEX_HOME/archived_sessions/rollout-*.jsonl" },
    { adapterId: "gemini-cli", sourceId: "gemini-cli", path: path.join(geminiHome, "tmp"), location: "~/.gemini/tmp/<project-hash>/chats/session-*.jsonl" },
  ].map((item) => ({ ...item, path: path.resolve(item.path), platform }));
}

// Preview lists only names and sizes. It never opens record contents.
export async function previewSessionSource(source, { maxFiles = MAX_SESSION_FILES } = {}) {
  const root = path.resolve(source.path);
  let st;
  try { st = await lstat(root); } catch (error) { return { ...source, available: false, sessionFiles: 0, estimated: true, status: error.code === "ENOENT" ? "not_present" : "unavailable" }; }
  if (!st.isDirectory() || st.isSymbolicLink()) return { ...source, available: false, sessionFiles: 0, estimated: true, status: "not_a_safe_directory" };
  const rootReal = await realpath(root);
  if (rootReal.toLowerCase() !== root.toLowerCase()) return { ...source, available: false, sessionFiles: 0, estimated: true, status: "noncanonical_path" };
  let count = 0, bytes = 0, skipped = 0;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && count + skipped < maxFiles) {
    const current = queue.shift();
    let names;
    try { names = await readdir(current.dir); } catch { continue; }
    for (const name of names) {
      const full = path.join(current.dir, name);
      let child;
      try { child = await lstat(full); } catch { continue; }
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory() && current.depth < MAX_DEPTH && !/^\.|node_modules|cache|checkpoint/i.test(name)) queue.push({ dir: full, depth: current.depth + 1 });
      else if (child.isFile() && /\.jsonl$/i.test(name) && (source.adapterId !== "codex" || name.startsWith("rollout-"))) {
        if (child.size > MAX_SESSION_FILE_BYTES) skipped++; else { count++; bytes += child.size; }
      }
      if (count + skipped >= maxFiles) break;
    }
  }
  return { ...source, available: true, sessionFiles: count, skippedOversize: skipped, estimated: true, bytesAvailable: bytes, status: "awaiting_consent" };
}

export async function analyzeApprovedSessionSource(source, projectRoot, { maxFiles = MAX_SESSION_FILES, projectId = null } = {}) {
  const root = path.resolve(source.path);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error("approved_source_path_changed_or_unsafe");
  const project = await realpath(projectRoot);
  const repository = await inspectGitRepository(project);
  const projectRoots = repository?.worktrees || [project];
  const adapter = ADAPTERS[source.adapterId];
  if (!adapter) throw new Error("unsupported_session_adapter");
  const result = { adapterId: source.adapterId, adapterVersion: adapter.version, format: adapter.format, filesDiscovered: 0, filesRead: 0, parsedRecords: 0, sessions: [], skipped: 0, matched: 0 };
  const parsedSessionIds = new Set();
  const matchedSessionIds = new Set();
  const matchedSessions = new Map();
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && result.filesDiscovered < maxFiles) {
    const current = queue.shift();
    let names;
    try { names = await readdir(current.dir); } catch { continue; }
    for (const name of names) {
      const full = path.join(current.dir, name);
      let st;
      try { st = await lstat(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory() && current.depth < MAX_DEPTH && !/^\.|node_modules|cache|checkpoint/i.test(name)) queue.push({ dir: full, depth: current.depth + 1 });
      else if (st.isFile() && /\.jsonl$/i.test(name) && (source.adapterId !== "codex" || name.startsWith("rollout-"))) {
        result.filesDiscovered++;
        if (st.size > MAX_SESSION_FILE_BYTES) { result.skipped++; continue; }
        const canonicalFile = await realpath(full).catch(() => null);
        const relativeFile = canonicalFile ? path.relative(root, canonicalFile) : "..";
        if (!canonicalFile || relativeFile === ".." || relativeFile.startsWith(".." + path.sep) || path.isAbsolute(relativeFile)) { result.skipped++; continue; }
        let text;
        try { text = await readFile(full, "utf8"); } catch { result.skipped++; continue; }
        result.filesRead++;
        try {
          const records = parseLines(text);
          for (const id of validSessionIds(source.adapterId, records)) parsedSessionIds.add(id);
          const summary = adapter.parse(text, name, projectRoots, { projectId, repositoryIdentity: repository?.identity || project });
          if (!summary) { result.skipped++; continue; }
          if (summary.association !== "exact_root") continue;
          matchedSessionIds.add(summary.sessionKey);
          matchedSessions.set(summary.sessionKey, summary);
        } catch { result.skipped++; }
      }
      if (result.filesDiscovered >= maxFiles) break;
    }
  }
  result.parsedRecords = parsedSessionIds.size;
  result.matched = matchedSessionIds.size;
  result.sessions = [...matchedSessions.values()];
  return result;
}

export async function analyzeApprovedAiderProjectFile(source, projectRoot, { projectId = null, maxBytes = 12 * 1024 * 1024 } = {}) {
  const project = await assertSafeRoot(projectRoot);
  const candidate = await assertContainedNoLinks(project, source.path);
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("aider_source_not_regular_file");
  const canonical = await realpath(candidate);
  if (canonical.toLowerCase() !== candidate.toLowerCase()) throw new Error("aider_source_noncanonical_path");
  if (path.relative(project, canonical) !== ".aider.chat.history.md") throw new Error("unsupported_aider_project_history_path");
  if (stat.size > maxBytes) throw new Error("aider_source_exceeds_size_limit");
  if (!await hasExactSourceGrant(canonical, source.sourceId, projectId, project)) throw new Error("aider_source_consent_required");
  const repository = await inspectGitRepository(project);
  const markdown = await readFile(canonical, "utf8");
  const sessions = parseAiderChatHistory(markdown, canonical, project, { projectId, repositoryIdentity: repository?.identity || project });
  return {
    adapterId: "aider", adapterVersion: ADAPTERS.aider.version, format: ADAPTERS.aider.format,
    filesDiscovered: 1, filesRead: 1, parsedRecords: sessions.length, sessions, skipped: 0, matched: sessions.length,
  };
}

function parseLines(raw, maxLines = 100_000) {
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    if (records.length >= maxLines) break;
    try { const value = JSON.parse(line); if (value && typeof value === "object" && !Array.isArray(value)) records.push(value); } catch { /* Ignore malformed and partial records. */ }
  }
  return records;
}
function canonical(value) { if (typeof value !== "string" || !value) return null; try { return path.resolve(value).replaceAll("\\", "/").replace(/\/$/, "").toLowerCase(); } catch { return null; } }
function exactRoot(value, projects) { return projects.some(project => canonical(value) === canonical(project)); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function textOf(value) { if (typeof value === "string") return value; if (!Array.isArray(value)) return ""; return value.map((item) => typeof item === "string" ? item : typeof item?.text === "string" ? item.text : "").join(" "); }
const sessionHash = (adapterId, sessionId) => hash(adapterId + "\0" + sessionId);
function promptSignals(text) {
  const signals = [];
  if (/\b(plan|planning|design|architecture|approach|steps|before coding)\b/i.test(text)) signals.push("planning_language");
  if (/\b(no,|instead|actually|that is wrong|doesn't work|didn't work|fix this|try again|revert|you missed)\b/i.test(text)) signals.push("correction_language");
  if (/\b(debug|bug|broken|error|failing|regression)\b/i.test(text)) signals.push("intent_debug");
  else if (/\b(explain|understand|how does|why does)\b/i.test(text)) signals.push("intent_explain");
  else if (/\b(plan|design|architecture|approach)\b/i.test(text)) signals.push("intent_plan");
  else if (/\b(add|build|implement|create|change|update|remove|fix)\b/i.test(text)) signals.push("intent_change");
  if (/\b(user|customer|usability|user experience|accessibility|workflow|product requirement|trade[- ]?off|privacy impact|security impact|latency|pricing|cost impact|scope)\b/i.test(text)) signals.push("product_context_language");
  return signals;
}

const TASK_REFERENCE_KEYS = ["taskId", "task_id", "issueId", "issue_id", "ticketId", "ticket_id"];
const BRANCH_KEYS = ["branch", "branchName", "branch_name", "gitBranch", "git_branch"];
const COMMIT_REFERENCE_KEYS = ["commitId", "commit_id", "commitHash", "commit_hash"];
const referenceHash = (projectId, kind, value) => hash(`${projectId || "unscoped"}\0${kind}\0${String(value).trim().toLowerCase()}`);

function structuredArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.length < 64_000) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; } catch { return null; } }
  return null;
}

function explicitSessionReferences(adapterId, rows, projectId) {
  const metadataRows = [];
  for (const row of rows) {
    if (row.metadata && typeof row.metadata === "object") metadataRows.push(row.metadata);
    if (row.sessionMetadata && typeof row.sessionMetadata === "object") metadataRows.push(row.sessionMetadata);
    if (row.$set && typeof row.$set === "object") metadataRows.push(row.$set);
    const payload = row.payload || {};
    if (payload.meta && typeof payload.meta === "object") metadataRows.push(payload.meta);
    if (adapterId === "gemini-cli" && row.sessionId) metadataRows.push(row);
  }
  const collect = (keys, type, valid) => [...new Set(metadataRows.flatMap((item) => keys.flatMap((key) => {
    const values = Array.isArray(item[key]) ? item[key] : [item[key]];
    return values.filter((value) => typeof value === "string" && valid(value)).map((value) => referenceHash(projectId, type, value));
  })))].slice(0, 32);
  const branchValues = metadataRows.flatMap((item) => BRANCH_KEYS.map((key) => item[key])).filter((value) => typeof value === "string" && value.trim() && value.length <= 160);
  const taskReferences = collect(TASK_REFERENCE_KEYS, "task", (value) => /^(?:[A-Z][A-Z0-9]{1,11}-\d{1,10}|[0-9a-f-]{8,64})$/i.test(value.trim()));
  const commitReferences = collect(COMMIT_REFERENCE_KEYS, "commit-prefix", (value) => /^[0-9a-f]{7,64}$/i.test(value.trim()));
  const parents = metadataRows.flatMap((item) => [item.parentSessionId, item.parent_session_id, item.parentThreadId, item.parent_thread_id]).filter((value) => typeof value === "string" && value.length <= 256);
  return {
    taskReferenceHashes: taskReferences,
    branchIdentity: branchValues.length ? referenceHash(projectId, "branch", branchValues.at(-1)) : null,
    relatedCommitReferences: commitReferences,
    explicitParentSessionId: parents.at(-1) || null,
  };
}

function addFileReference(target, cwd, projectId, candidate) {
  if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 1_024 || !cwd) return;
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(cwd, candidate);
  const relative = path.relative(path.resolve(cwd), resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  const normalized = relative.replaceAll("\\", "/").toLowerCase();
  target.add(hash(`${projectId || "unscoped"}\0file\0${normalized}`));
}

function collectFileReferences(target, cwd, projectId, toolName, args) {
  if (!/(edit|write|replace|patch|apply|read_file|view_file|open_file|notebook)/i.test(String(toolName || ""))) return;
  const input = structuredArguments(args);
  if (!input) return;
  for (const key of ["file_path", "filePath", "target_file", "path"]) addFileReference(target, cwd, projectId, input[key]);
}

function materializeEvents({ adapterId, adapterVersion, rawSessionId, cwd, repositoryIdentity, projectId, eventInputs, start, end, explicitStart = false, explicitEnd = false, parentSessionId = null, actor = "assistant" }) {
  if (!cwd || !rawSessionId) return [];
  const sessionKey = sessionHash(adapterId, rawSessionId);
  const normalizer = createSessionEventNormalizer({ adapterId, adapterVersion, rawSessionId, sessionKey, projectId, repositoryIdentity, worktreePath: cwd });
  const orderedInputs = [...eventInputs].sort((left, right) => left.sourceSequence - right.sourceSequence || left.subSequence - right.subSequence);
  const toolEvents = new Map();
  let failedSinceSuccess = false;
  if (!explicitStart) normalizer.add({ sourceSequence: 0, sourceRecordId: "derived-session-start", sourceRecordType: "session_boundary", timestamp: start, type: "session_start", actor: "system", attribution: "inferred", confidence: "low" });
  if (parentSessionId) normalizer.add({ sourceSequence: 0, sourceRecordId: "parent-session-metadata", sourceRecordType: "session_meta", timestamp: start, type: "subagent_dispatch", actor: "subagent", parentSessionId: sessionHash(adapterId, parentSessionId), attribution: "observed", confidence: "high" });
  for (const input of orderedInputs) {
    const parentEventId = input.parentRef ? toolEvents.get(input.parentRef) || null : null;
    const lexicalSignals = input.text ? promptSignals(input.text) : [];
    const eventType = input.type === "tool_result" && input.subagentReturn ? "subagent_return"
      : input.type === "user_prompt" && lexicalSignals.includes("correction_language") ? "developer_correction" : input.type;
    const signals = [...(input.signals || []), ...lexicalSignals];
    const event = normalizer.add({
      sourceSequence: input.sourceSequence, sourceRecordId: input.sourceRecordId, sourceRecordType: input.sourceRecordType,
      timestamp: input.timestamp, type: eventType, actor: input.actor || actor, toolIdentity: input.toolIdentity,
      toolCategory: input.toolCategory || (input.toolIdentity ? toolKind(input.toolIdentity) : null),
      parentEventId, parentSessionId: input.parentSessionId ? sessionHash(adapterId, input.parentSessionId) : null,
      relationshipId: input.relationshipId || input.linkRef, modelIdentifier: input.modelIdentifier,
      signals, outcome: input.outcome, attribution: input.attribution || "observed", confidence: input.confidence || (lexicalSignals.length ? "low" : "high"),
    });
    if (!event) continue;
    if (input.linkRef && ["tool_call", "subagent_dispatch", "plan_update"].includes(input.type)) toolEvents.set(input.linkRef, event.eventId);
    if (input.outcome === "failure" || input.type === "error") failedSinceSuccess = true;
    if (input.type === "tool_result" && input.outcome === "success" && failedSinceSuccess) {
      normalizer.add({ sourceSequence: input.sourceSequence, sourceRecordId: `${input.sourceRecordId || input.sourceSequence}-recovery`, sourceRecordType: input.sourceRecordType, timestamp: input.timestamp, type: "recovery", actor: "system", parentEventId: event.eventId, outcome: "success", attribution: "inferred", confidence: "medium" });
      failedSinceSuccess = false;
    }
  }
  if (!explicitEnd) {
    const lastSequence = orderedInputs.reduce((max, item) => Math.max(max, item.sourceSequence), 0) + 1;
    normalizer.add({ sourceSequence: lastSequence, sourceRecordId: "derived-session-end", sourceRecordType: "session_boundary", timestamp: end, type: "session_end", actor: "system", outcome: "unknown", attribution: "inferred", confidence: "low" });
  }
  return normalizer.list();
}

function summarize({ adapterId, adapterVersion, sessionId, cwd, start, end, userTexts, assistantTexts, models, tools, failures, recoveries, projects, repositoryIdentity, projectId, eventInputs, explicitStart, explicitEnd, parentSessionId, sessionActor, rows, fileReferenceHashes = [] }) {
  if (!exactRoot(cwd, projects) || !sessionId) return null;
  const startMs = Date.parse(start || ""), endMs = Date.parse(end || "");
  const durations = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.round((endMs - startMs) / 1000) : null;
  const explicitRefs = explicitSessionReferences(adapterId, rows || [], projectId);
  const effectiveParent = parentSessionId || explicitRefs.explicitParentSessionId;
  const events = materializeEvents({ adapterId, adapterVersion, rawSessionId: sessionId, cwd, repositoryIdentity, projectId, eventInputs, start, end, explicitStart, explicitEnd, parentSessionId: effectiveParent, actor: sessionActor });
  const timeline = analyzeSessionTimeline(events, { truncated: events.length >= 3_000 });
  const timelineFailures = events.filter((event) => event.outcome === "failure" || event.type === "error").length;
  const timelineRecoveries = events.filter((event) => event.type === "recovery").length;
  const planningPrompts = userTexts.filter((text) => promptSignals(text).includes("planning_language")).length;
  const correctionPrompts = userTexts.filter((text) => promptSignals(text).includes("correction_language")).length;
  const sortedModels = [...models].filter(Boolean).sort();
  return {
    sessionKey: sessionHash(adapterId, sessionId), source: adapterId, association: "exact_root", evidence: "confirmed",
    startedAt: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    endedAt: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
    durationSeconds: durations, userTurns: userTexts.length, assistantTurns: assistantTexts.length,
    promptWordCount: userTexts.reduce((sum, text) => sum + text.trim().split(/\s+/).filter(Boolean).length, 0),
    planningSignals: planningPrompts, correctionSignals: correctionPrompts, toolCallCount: tools.length,
    toolKinds: [...new Set(tools.map(toolKind).filter(Boolean))].sort().slice(0, 20),
    models: sortedModels.slice(0, 8), failureSignals: timelineFailures || failures, recoverySignals: timelineRecoveries || (failures > 0 && recoveries > 0 ? 1 : 0),
    events, timelineAnalysis: timeline, sequenceSummary: summarizeSessionTimeline(timeline, events),
    taskReferenceHashes: explicitRefs.taskReferenceHashes,
    branchIdentity: explicitRefs.branchIdentity,
    fileReferenceHashes: [...new Set(fileReferenceHashes)].slice(0, 128),
    relatedCommitReferences: explicitRefs.relatedCommitReferences,
    explicitParentSessionId: effectiveParent ? sessionHash(adapterId, effectiveParent) : null,
    explicitRelatedSessionIds: [...new Set([effectiveParent, ...eventInputs.map((item) => item.relatedSessionId)].filter((value) => typeof value === "string").map((value) => sessionHash(adapterId, value)))].slice(0, 32),
  };
}

/** Parses only Aider's project-local Markdown chat log. It does not infer tools, models, or timestamps for individual turns. */
export function parseAiderChatHistory(markdown, filePath, projectRoot, context = {}) {
  if (typeof markdown !== "string" || typeof filePath !== "string" || typeof projectRoot !== "string") return [];
  const relativeFile = path.relative(path.resolve(projectRoot), path.resolve(filePath));
  if (relativeFile !== ".aider.chat.history.md") return [];
  const chunks = [];
  let active = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^# aider chat started at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/.exec(line);
    if (marker && isValidAiderLocalTimestamp(marker[1])) {
      if (active) chunks.push(active);
      active = { startLabel: marker[1], lines: [] };
    } else if (/^# aider chat started at\b/.test(line)) {
      // A malformed marker is not trusted as a conversation boundary or event.
      // Ignore it while retaining the surrounding valid source order.
      continue;
    } else if (active) active.lines.push(line);
  }
  if (active) chunks.push(active);
  if (!chunks.length && /^\s*####\s+/m.test(markdown)) chunks.push({ startLabel: null, lines: markdown.split(/\r?\n/) });

  const root = path.resolve(projectRoot);
  const repositoryIdentity = context.repositoryIdentity || root;
  const sessions = [];
  for (let sessionIndex = 0; sessionIndex < chunks.length; sessionIndex++) {
    const chunk = chunks[sessionIndex], turns = [];
    let promptLines = null, responseLines = [], inFence = false;
    const flushPrompt = () => {
      if (promptLines?.some((value) => value.trim())) turns.push({ type: "user_prompt", text: promptLines.join("\n").trim(), sequence: turns.length + 1, recordId: `input-${turns.length}` });
      promptLines = null;
    };
    const flushResponse = () => {
      // Aider's logger writes application tool output as Markdown blockquotes;
      // keep only its unquoted output text and do not invent tool-result events.
      const text = responseLines.filter((line) => !/^\s*>/.test(line)).join("\n").trim();
      if (text) turns.push({ type: "assistant_response", text, sequence: turns.length + 1, recordId: `output-${turns.length}` });
      responseLines = [];
    };
    for (const line of chunk.lines) {
      if (/^\s*(?:```|~~~)/.test(line) && promptLines === null) inFence = !inFence;
      const userLine = inFence ? null : /^####(?:\s(.*))?$/.exec(line);
      if (userLine) {
        if (promptLines === null) { flushResponse(); promptLines = []; }
        promptLines.push(userLine[1] || "");
      } else {
        if (promptLines !== null) flushPrompt();
        responseLines.push(line);
      }
    }
    flushPrompt(); flushResponse();
    if (!turns.some((turn) => turn.type === "user_prompt")) continue;

    const rawSessionId = `aider:${context.projectId || repositoryIdentity}:${relativeFile}:${chunk.startLabel || "start-unknown"}:${sessionIndex}`;
    const eventInputs = [];
    if (chunk.startLabel) eventInputs.push({ sourceSequence: 0, sourceRecordId: `session-start-${sessionIndex}`, sourceRecordType: "aider.session_start_marker", type: "session_start", actor: "system", attribution: "observed", confidence: "high" });
    for (const turn of turns) eventInputs.push({
      sourceSequence: turn.sequence,
      sourceRecordId: turn.recordId,
      sourceRecordType: turn.type === "user_prompt" ? "aider.markdown_user_heading" : "aider.markdown_turn_output",
      type: turn.type,
      actor: turn.type === "user_prompt" ? "user" : "assistant",
      text: turn.text,
      attribution: turn.type === "user_prompt" ? "observed" : "inferred",
      confidence: turn.type === "user_prompt" ? "high" : "medium",
    });
    const summary = summarize({
      adapterId: "aider", adapterVersion: "1", sessionId: rawSessionId, cwd: root,
      start: null, end: null,
      userTexts: turns.filter((turn) => turn.type === "user_prompt").map((turn) => turn.text),
      assistantTexts: turns.filter((turn) => turn.type === "assistant_response").map((turn) => turn.text),
      models: new Set(), tools: [], failures: 0, recoveries: 0, projects: [root],
      repositoryIdentity, projectId: context.projectId || null, eventInputs,
      explicitStart: Boolean(chunk.startLabel), explicitEnd: false, rows: [],
    });
    if (summary) sessions.push(summary);
  }
  return sessions;
}

function isValidAiderLocalTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toolKind(name) {
  const s = String(name || "").toLowerCase();
  if (!s) return "tool";
  if (/shell|bash|command|terminal|exec/.test(s)) return "shell";
  if (/edit|write|replace|patch|apply/.test(s)) return "file_edit";
  if (/read|view|open/.test(s)) return "file_read";
  if (/search|grep|glob|find/.test(s)) return "search";
  if (/test|lint|build/.test(s)) return "verification";
  return "other";
}
function parseClaude(raw, filename, projects, context) {
  const rows = parseLines(raw), users = [], assistants = [], models = new Set(), tools = [], eventInputs = [], calls = new Map();
  const fileReferenceHashes = new Set();
  let cwd, start, end, sessionId, currentModel, failures = 0, recoveries = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row.type !== "user" && row.type !== "assistant") continue;
    if (row.isMeta || row.isCompactSummary) continue;
    cwd ||= row.cwd; sessionId ||= row.sessionId; start ||= row.timestamp;
    if (row.timestamp && (!end || Date.parse(row.timestamp) > Date.parse(end))) end = row.timestamp;
    const msg = row.message || {};
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    if (row.type === "user") {
      const text = textOf(msg.content);
      if (text) { users.push(text); eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: row.uuid || `user-${rowIndex}`, sourceRecordType: row.type, timestamp: row.timestamp, type: "user_prompt", actor: "user", text }); }
    } else {
      const text = textOf(msg.content);
      if (text) { assistants.push(text); eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: row.uuid || `assistant-${rowIndex}`, sourceRecordType: row.type, timestamp: row.timestamp, type: "assistant_response", actor: "assistant" }); }
      if (msg.model && msg.model !== "<synthetic>") {
        models.add(msg.model);
        if (currentModel !== msg.model) { eventInputs.push({ sourceSequence: rowIndex * 100 + 1, sourceRecordId: `${row.uuid || rowIndex}-model-${msg.model}`, sourceRecordType: row.type, timestamp: row.timestamp, type: "model_change", actor: "system", modelIdentifier: msg.model }); currentModel = msg.model; }
      }
    }
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex];
      if (block?.type === "tool_use") {
        collectFileReferences(fileReferenceHashes, cwd, context.projectId, block.name, block.input);
        tools.push(block.name);
        const callId = typeof block.id === "string" ? block.id : `call-${rowIndex}-${blockIndex}`;
        calls.set(callId, block.name);
        const task = /^(Task|Agent)$/i.test(String(block.name || ""));
        const isPlan = /plan|todo/i.test(String(block.name || ""));
        eventInputs.push({ sourceSequence: rowIndex * 100 + 2 + blockIndex, sourceRecordId: block.id || `${row.uuid || rowIndex}-tool-${blockIndex}`, sourceRecordType: "tool_use", timestamp: row.timestamp, type: task ? "subagent_dispatch" : isPlan ? "plan_update" : "tool_call", actor: "assistant", toolIdentity: block.name, linkRef: callId, relationshipId: block.agentId || callId, confidence: "high" });
        if (block.input?.run_in_background === true) eventInputs.push({ sourceSequence: rowIndex * 100 + 3 + blockIndex, sourceRecordId: `${callId}-background-start`, sourceRecordType: "tool_use", timestamp: row.timestamp, type: "background_execution_start", actor: task ? "subagent" : "tool", toolIdentity: block.name, linkRef: callId });
      }
      if (block?.type === "tool_result") {
        const callId = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
        const task = /^(Task|Agent)$/i.test(String(calls.get(callId) || ""));
        const outcome = block.is_error === true ? "failure" : block.is_error === false ? "success" : "unknown";
        if (outcome === "failure") failures++; else if (outcome === "success" && failures) recoveries++;
        eventInputs.push({ sourceSequence: rowIndex * 100 + 50 + blockIndex, sourceRecordId: callId ? `${callId}-result` : `${row.uuid || rowIndex}-result-${blockIndex}`, sourceRecordType: "tool_result", timestamp: row.timestamp, type: "tool_result", actor: task ? "subagent" : "tool", toolIdentity: calls.get(callId), parentRef: callId, outcome, subagentReturn: task, relationshipId: callId, confidence: block.is_error === undefined ? "medium" : "high" });
        if (calls.get(callId) && /^(Task|Agent)$/i.test(calls.get(callId))) eventInputs.push({ sourceSequence: rowIndex * 100 + 70 + blockIndex, sourceRecordId: `${callId}-background-end`, sourceRecordType: "tool_result", timestamp: row.timestamp, type: "background_execution_end", actor: "subagent", parentRef: callId, outcome });
      }
    }
  }
  const rawId = sessionId || path.basename(filename, ".jsonl");
  return summarize({ adapterId: "claude-code", adapterVersion: "2", sessionId: rawId, cwd, start, end, userTexts: users, assistantTexts: assistants, models, tools, failures, recoveries, projects, eventInputs, rows, fileReferenceHashes: [...fileReferenceHashes], ...context, explicitStart: false, explicitEnd: false });
}
function parseCodex(raw, filename, projects, context) {
  const rows = parseLines(raw), users = [], fallbackUsers = [], assistants = [], models = new Set(), tools = [], eventInputs = [], calls = new Map();
  const fileReferenceHashes = new Set();
  let meta, start, end, currentModel, failures = 0, recoveries = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex], payload = row.payload || {};
    if (row.type === "session_meta") {
      meta = payload.meta || payload; start ||= meta.timestamp || row.timestamp;
      if (meta.model) models.add(meta.model);
      eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: `session-start-${meta.id || meta.session_id || rowIndex}`, sourceRecordType: "session_meta", timestamp: meta.timestamp || row.timestamp, type: "session_start", actor: "system", attribution: "observed" });
      if (meta.model && meta.model !== currentModel) { eventInputs.push({ sourceSequence: rowIndex * 100 + 1, sourceRecordId: `initial-model-${rowIndex}`, sourceRecordType: "session_meta", timestamp: row.timestamp || meta.timestamp, type: "model_change", actor: "system", modelIdentifier: meta.model }); currentModel = meta.model; }
      if (meta.parent_thread_id) eventInputs.push({ sourceSequence: rowIndex * 100 + 2, sourceRecordId: `parent-${rowIndex}`, sourceRecordType: "session_meta", timestamp: row.timestamp || meta.timestamp, type: "subagent_dispatch", actor: "subagent", parentSessionId: meta.parent_thread_id, confidence: "high" });
    }
    if (typeof payload.model === "string") {
      models.add(payload.model);
      if (payload.model !== currentModel) { eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: `model-${rowIndex}`, sourceRecordType: row.type, timestamp: row.timestamp, type: "model_change", actor: "system", modelIdentifier: payload.model }); currentModel = payload.model; }
    }
    if (row.timestamp && (!end || Date.parse(row.timestamp) > Date.parse(end))) end = row.timestamp;
    if (row.type === "response_item" && payload.type === "message") {
      const text = textOf(payload.content);
      if (payload.role === "user" && text) { users.push(text); eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `user-${rowIndex}`, sourceRecordType: "response_item.message", timestamp: row.timestamp, type: "user_prompt", actor: "user", text }); }
      if (payload.role === "assistant" && text) { assistants.push(text); eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `assistant-${rowIndex}`, sourceRecordType: "response_item.message", timestamp: row.timestamp, type: "assistant_response", actor: "assistant" }); }
    }
    if (row.type === "response_item" && ["function_call", "custom_tool_call", "local_shell_call"].includes(payload.type)) {
      const tool = payload.name || payload.tool_name || payload.type, callId = payload.call_id || payload.id || `call-${rowIndex}`;
      collectFileReferences(fileReferenceHashes, meta?.cwd, context.projectId, tool, payload.arguments);
      tools.push(tool); calls.set(callId, tool);
      const plan = /plan|todo/i.test(String(tool));
      eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: callId, sourceRecordType: `response_item.${payload.type}`, timestamp: row.timestamp, type: plan ? "plan_update" : "tool_call", actor: "tool", toolIdentity: tool, linkRef: callId, confidence: "high" });
    }
    if (row.type === "response_item" && ["function_call_output", "custom_tool_call_output"].includes(payload.type)) {
      const callId = payload.call_id || payload.id || null, outcome = payload.is_error === true ? "failure" : payload.is_error === false ? "success" : "unknown";
      if (outcome === "failure") failures++; else if (outcome === "success" && failures) recoveries++;
      eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `result-${rowIndex}`, sourceRecordType: `response_item.${payload.type}`, timestamp: row.timestamp, type: "tool_result", actor: "tool", toolIdentity: calls.get(callId), parentRef: callId, outcome, confidence: payload.is_error === undefined ? "medium" : "high" });
    }
    if (row.type === "event_msg") {
      const eventType = payload.type;
      if (eventType === "user_message" && payload.message) fallbackUsers.push(payload.message);
      if (["task_started", "turn_started"].includes(eventType)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.turn_id || `turn-start-${rowIndex}`, sourceRecordType: `event_msg.${eventType}`, timestamp: row.timestamp, type: "session_start", actor: "system", attribution: "observed" });
      if (["task_complete", "turn_complete"].includes(eventType)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.turn_id || `turn-end-${rowIndex}`, sourceRecordType: `event_msg.${eventType}`, timestamp: row.timestamp, type: "session_end", actor: "system", outcome: payload.error ? "failure" : "success", attribution: "observed" });
      if (["plan_update", "plan_delta", "plan_create"].includes(eventType)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.turn_id || `plan-${rowIndex}`, sourceRecordType: `event_msg.${eventType}`, timestamp: row.timestamp, type: eventType === "plan_create" ? "plan_create" : "plan_update", actor: "assistant", confidence: "high" });
      if (eventType === "error" || eventType === "stream_error") { failures++; eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.turn_id || `error-${rowIndex}`, sourceRecordType: `event_msg.${eventType}`, timestamp: row.timestamp, type: "error", actor: "system", outcome: "failure", confidence: "high" }); }
      if (eventType === "exec_command_end" && Number.isSafeInteger(payload.exit_code)) {
        const outcome = payload.exit_code === 0 ? "success" : "failure";
        if (outcome === "failure") failures++; else if (failures) recoveries++;
        eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.call_id || `exec-end-${rowIndex}`, sourceRecordType: "event_msg.exec_command_end", timestamp: row.timestamp, type: "tool_result", actor: "tool", toolIdentity: "shell", parentRef: payload.call_id || null, outcome, confidence: "high" });
      }
      if (eventType === "background_event") {
        const state = String(payload.status || payload.event || "").toLowerCase();
        if (/start|running|launched/.test(state)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `background-start-${rowIndex}`, sourceRecordType: "event_msg.background_event", timestamp: row.timestamp, type: "background_execution_start", actor: "tool", toolIdentity: "background_task", relationshipId: payload.task_id || payload.id, confidence: "medium" });
        else if (/complete|finish|exit|stop/.test(state)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `background-end-${rowIndex}`, sourceRecordType: "event_msg.background_event", timestamp: row.timestamp, type: "background_execution_end", actor: "tool", toolIdentity: "background_task", relationshipId: payload.task_id || payload.id, confidence: "medium" });
      }
    }
    if (row.type === "inter_agent_communication" && (payload.from_thread_id || payload.sender_thread_id) && (payload.to_thread_id || payload.recipient_thread_id)) eventInputs.push({ sourceSequence: rowIndex * 100, sourceRecordId: payload.id || `agent-message-${rowIndex}`, sourceRecordType: row.type, timestamp: row.timestamp, type: "inter_agent_message", actor: "subagent", parentSessionId: payload.from_thread_id || payload.sender_thread_id, relatedSessionId: payload.to_thread_id || payload.recipient_thread_id, relationshipId: `${payload.from_thread_id || payload.sender_thread_id}:${payload.to_thread_id || payload.recipient_thread_id}`, confidence: "high" });
  }
  if (!meta) return null;
  const finalUsers = users.length ? users : fallbackUsers;
  if (!users.length) for (let index = 0; index < fallbackUsers.length; index++) eventInputs.push({ sourceSequence: index * 100, sourceRecordId: `fallback-user-${index}`, sourceRecordType: "event_msg.user_message", type: "user_prompt", actor: "user", text: fallbackUsers[index], confidence: "medium" });
  const rawId = meta.session_id || meta.id || path.basename(filename);
  return summarize({ adapterId: "codex", adapterVersion: "2", sessionId: rawId, cwd: meta.cwd, start, end, userTexts: finalUsers, assistantTexts: assistants, models, tools, failures, recoveries, projects, eventInputs, rows, fileReferenceHashes: [...fileReferenceHashes], ...context, explicitStart: true, explicitEnd: eventInputs.some((item) => item.type === "session_end" && item.attribution === "observed"), parentSessionId: meta.parent_thread_id || null, sessionActor: meta.parent_thread_id ? "subagent" : "assistant" });
}
function parseGemini(raw, filename, projects, context) {
  const rows = parseLines(raw);
  const messages = new Map();
  let metadata = {};
  const applyMessage = (record) => { if (record && typeof record.id === "string") messages.set(record.id, record); };
  for (const row of rows) {
    if (row.sessionId && row.projectHash) metadata = { ...metadata, ...row };
    if (row.id && !row.$patch) applyMessage(row);
    if (Array.isArray(row.messages)) for (const message of row.messages) applyMessage(message);
    if (row.$set && typeof row.$set === "object") {
      metadata = { ...metadata, ...row.$set };
      if (Array.isArray(row.$set.messages)) { messages.clear(); for (const message of row.$set.messages) applyMessage(message); }
    }
    if (row.$patch && typeof row.$patch === "object") {
      const patch = row.$patch;
      const updates = [...(patch.id ? [patch] : []), ...(Array.isArray(patch.updates) ? patch.updates : [])];
      for (const update of updates) if (typeof update?.id === "string" && messages.has(update.id)) messages.set(update.id, { ...messages.get(update.id), ...update });
      for (const id of Array.isArray(patch.removeIds) ? patch.removeIds : []) messages.delete(id);
      if (Array.isArray(patch.orderIds)) {
        const ordered = patch.orderIds.map((id) => messages.get(id)).filter(Boolean);
        for (const [id, message] of messages) if (!patch.orderIds.includes(id)) ordered.push(message);
        messages.clear(); for (const message of ordered) applyMessage(message);
      }
    }
    if (row.$rewindTo && typeof row.$rewindTo === "string") {
      const ids = [...messages.keys()], index = ids.indexOf(row.$rewindTo);
      for (const id of ids.slice(index < 0 ? 0 : index)) messages.delete(id);
    }
  }
  const record = { ...metadata, messages: [...messages.values()] };
  if (!record?.sessionId || !record.projectHash) return null;
  const candidates = projects.flatMap(project => {
    const resolved = path.resolve(project);
    return [resolved, resolved.replace(/^\\\\\?\\/, ""), resolved.replaceAll("\\", "/"), resolved.replaceAll("\\", "/").replace(/^\/\//, "//")];
  });
  if (!candidates.some((candidate) => hash(candidate) === record.projectHash)) return null;
  const users = [], assistants = [], models = new Set(), tools = [], eventInputs = [];
  const fileReferenceHashes = new Set();
  let failures = 0, recoveries = 0, currentModel = null;
  for (let messageIndex = 0; messageIndex < (record.messages || []).length; messageIndex++) {
    const message = record.messages[messageIndex];
    const content = textOf(message.content);
    const seqBase = messageIndex * 100;
    if (message.type === "user" && content) { users.push(content); eventInputs.push({ sourceSequence: seqBase, sourceRecordId: message.id, sourceRecordType: "message.user", timestamp: message.timestamp, type: "user_prompt", actor: "user", text: content }); }
    if (message.type === "gemini" && content) {
      assistants.push(content); eventInputs.push({ sourceSequence: seqBase, sourceRecordId: message.id, sourceRecordType: "message.gemini", timestamp: message.timestamp, type: "assistant_response", actor: record.kind === "subagent" ? "subagent" : "assistant" });
      if (message.model) {
        models.add(message.model);
        if (message.model !== currentModel) { eventInputs.push({ sourceSequence: seqBase + 1, sourceRecordId: `${message.id}-model`, sourceRecordType: "message.gemini", timestamp: message.timestamp, type: "model_change", actor: "system", modelIdentifier: message.model }); currentModel = message.model; }
      }
    }
    if (message.type === "error") { failures++; eventInputs.push({ sourceSequence: seqBase, sourceRecordId: message.id, sourceRecordType: "message.error", timestamp: message.timestamp, type: "error", actor: "system", outcome: "failure", confidence: "high" }); }
    for (let callIndex = 0; callIndex < (message.toolCalls || []).length; callIndex++) {
      const call = message.toolCalls[callIndex], callId = call.id || `${message.id}-tool-${callIndex}`;
      collectFileReferences(fileReferenceHashes, candidates.find(candidate => hash(candidate) === record.projectHash), context.projectId, call.name, call.args);
      tools.push(call.name);
      const plan = /plan|todo/i.test(String(call.name || ""));
      eventInputs.push({ sourceSequence: seqBase + 10 + callIndex * 3, sourceRecordId: call.id || callId, sourceRecordType: "tool_call_record", timestamp: call.timestamp || message.timestamp, type: plan ? "plan_update" : "tool_call", actor: call.agentId || record.kind === "subagent" ? "subagent" : "tool", toolIdentity: call.name, linkRef: callId, relationshipId: call.agentId || callId, confidence: "high" });
      if (call.result !== undefined || ["success", "error", "completed", "failed"].includes(String(call.status || "").toLowerCase())) {
        const status = String(call.status || "").toLowerCase();
        const outcome = call.error === true || status === "error" || status === "failed" ? "failure" : call.error === false || status === "success" || status === "completed" ? "success" : "unknown";
        if (outcome === "failure") failures++; else if (outcome === "success" && failures) recoveries++;
        eventInputs.push({ sourceSequence: seqBase + 11 + callIndex * 3, sourceRecordId: `${callId}-result`, sourceRecordType: "tool_call_record.result", timestamp: call.timestamp || message.timestamp, type: "tool_result", actor: "tool", toolIdentity: call.name, parentRef: callId, outcome, confidence: outcome === "unknown" ? "medium" : "high" });
      }
    }
  }
  const parentSessionId = typeof record.parentSessionId === "string" ? record.parentSessionId : typeof record.parent_session_id === "string" ? record.parent_session_id : null;
  const start = record.startTime, end = record.lastUpdated || rows.at(-1)?.timestamp;
  if (start) eventInputs.unshift({ sourceSequence: 0, sourceRecordId: "conversation-start", sourceRecordType: "conversation_metadata", timestamp: start, type: "session_start", actor: "system", attribution: "observed" });
  return summarize({ adapterId: "gemini-cli", adapterVersion: "2", sessionId: record.sessionId, cwd: candidates.find(candidate => hash(candidate) === record.projectHash), start, end, userTexts: users, assistantTexts: assistants, models, tools, failures, recoveries, projects, eventInputs, rows, fileReferenceHashes: [...fileReferenceHashes], ...context, explicitStart: Boolean(start), explicitEnd: false, parentSessionId, sessionActor: record.kind === "subagent" ? "subagent" : "assistant" });
}

function validSessionIds(adapterId, rows) {
  const ids = new Set();
  if (adapterId === "claude-code") {
    for (const row of rows) if (["user", "assistant"].includes(row.type) && typeof row.sessionId === "string" && row.message && typeof row.message === "object") ids.add(row.sessionId);
  }
  if (adapterId === "codex") {
    for (const row of rows) if (row.type === "session_meta") {
      const meta = row.payload?.meta || row.payload || {};
      const id = meta.id || meta.session_id;
      if (typeof id === "string" && typeof meta.cwd === "string") ids.add(id);
    }
  }
  if (adapterId === "gemini-cli") {
    for (const row of rows) if (typeof row.sessionId === "string" && typeof row.projectHash === "string") ids.add(row.sessionId);
  }
  return ids;
}

export const adapterMetadata = Object.fromEntries(Object.entries(ADAPTERS).map(([key, value]) => [key, { version: value.version, format: value.format }]));
