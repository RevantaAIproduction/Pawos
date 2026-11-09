import os from "node:os";
import path from "node:path";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";

export const MAX_SESSION_FILES = 5_000;
export const MAX_SESSION_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DEPTH = 12;
const ADAPTERS = {
  "claude-code": { version: "1", format: "Claude Code JSONL transcript (observed record schema)", parse: parseClaude },
  codex: { version: "1", format: "Codex rollout JSONL (session_meta / response_item / event_msg)", parse: parseCodex },
  "gemini-cli": { version: "1", format: "Gemini CLI conversation JSONL (ConversationRecord / message records)", parse: parseGemini },
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

export async function analyzeApprovedSessionSource(source, projectRoot, { maxFiles = MAX_SESSION_FILES } = {}) {
  const root = path.resolve(source.path);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error("approved_source_path_changed_or_unsafe");
  const project = await realpath(projectRoot);
  const adapter = ADAPTERS[source.adapterId];
  if (!adapter) throw new Error("unsupported_session_adapter");
  const result = { adapterId: source.adapterId, adapterVersion: adapter.version, format: adapter.format, filesRead: 0, sessions: [], skipped: 0, matched: 0 };
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && result.filesRead < maxFiles) {
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
        result.filesRead++;
        if (st.size > MAX_SESSION_FILE_BYTES) { result.skipped++; continue; }
        const canonicalFile = await realpath(full).catch(() => null);
        const relativeFile = canonicalFile ? path.relative(root, canonicalFile) : "..";
        if (!canonicalFile || relativeFile === ".." || relativeFile.startsWith(".." + path.sep) || path.isAbsolute(relativeFile)) { result.skipped++; continue; }
        let text;
        try { text = await readFile(full, "utf8"); } catch { result.skipped++; continue; }
        try {
          const summary = adapter.parse(text, name, project);
          if (!summary) { result.skipped++; continue; }
          if (summary.association !== "exact_root") continue;
          result.matched++;
          result.sessions.push(summary);
        } catch { result.skipped++; }
      }
      if (result.filesRead >= maxFiles) break;
    }
  }
  return result;
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
function exactRoot(value, project) { return canonical(value) === canonical(project); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function textOf(value) { if (typeof value === "string") return value; if (!Array.isArray(value)) return ""; return value.map((item) => typeof item === "string" ? item : typeof item?.text === "string" ? item.text : "").join(" "); }
function summarize({ adapterId, sessionId, cwd, start, end, userTexts, assistantTexts, models, tools, failures, recoveries, project }) {
  if (!exactRoot(cwd, project) || !sessionId) return null;
  const startMs = Date.parse(start || ""), endMs = Date.parse(end || "");
  const durations = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.round((endMs - startMs) / 1000) : null;
  const planningPrompts = userTexts.filter((text) => /\b(plan|planning|design|architecture|approach|steps|before coding)\b/i.test(text)).length;
  const correctionPrompts = userTexts.filter((text) => /\b(no,|instead|actually|that is wrong|doesn't work|didn't work|fix this|try again|revert|you missed)\b/i.test(text)).length;
  const sortedModels = [...models].filter(Boolean).sort();
  return {
    sessionKey: hash(adapterId + "\0" + sessionId), source: adapterId, association: "exact_root", evidence: "confirmed",
    startedAt: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    endedAt: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
    durationSeconds: durations, userTurns: userTexts.length, assistantTurns: assistantTexts.length,
    promptWordCount: userTexts.reduce((sum, text) => sum + text.trim().split(/\s+/).filter(Boolean).length, 0),
    planningSignals: planningPrompts, correctionSignals: correctionPrompts, toolCallCount: tools.length,
    toolKinds: [...new Set(tools.map(toolKind).filter(Boolean))].sort().slice(0, 20),
    models: sortedModels.slice(0, 8), failureSignals: failures, recoverySignals: failures > 0 && recoveries > 0 ? 1 : 0,
  };
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
function parseClaude(raw, filename, project) {
  const rows = parseLines(raw), users = [], assistants = [], models = new Set(), tools = [];
  let cwd, start, end, sessionId, failures = 0, recoveries = 0;
  for (const row of rows) {
    if (row.type !== "user" && row.type !== "assistant") continue;
    if (row.isMeta || row.isCompactSummary) continue;
    cwd ||= row.cwd; sessionId ||= row.sessionId; start ||= row.timestamp;
    if (row.timestamp && (!end || Date.parse(row.timestamp) > Date.parse(end))) end = row.timestamp;
    const msg = row.message || {};
    if (row.type === "user") {
      const txt = textOf(msg.content); if (txt) users.push(txt);
      for (const block of Array.isArray(msg.content) ? msg.content : []) if (block?.type === "tool_result" && block.is_error) failures++;
    }
    else {
      const txt = textOf(msg.content); if (txt) assistants.push(txt);
      if (msg.model && msg.model !== "<synthetic>") models.add(msg.model);
      for (const block of Array.isArray(msg.content) ? msg.content : []) {
        if (block?.type === "tool_use") tools.push(block.name);
        if (block?.type === "tool_result" && block.is_error) failures++;
      }
    }
  }
  return summarize({ adapterId: "claude-code", sessionId: sessionId || path.basename(filename, ".jsonl"), cwd, start, end, userTexts: users, assistantTexts: assistants, models, tools, failures, recoveries, project });
}
function parseCodex(raw, filename, project) {
  const rows = parseLines(raw), users = [], fallbackUsers = [], assistants = [], models = new Set(), tools = [];
  let meta, start, end, failures = 0, recoveries = 0;
  for (const row of rows) {
    const payload = row.payload || {};
    if (row.type === "session_meta") { meta = payload.meta || payload; start ||= meta.timestamp || row.timestamp; if (meta.model) models.add(meta.model); }
    if (typeof payload.model === "string") models.add(payload.model);
    if (row.timestamp && (!end || Date.parse(row.timestamp) > Date.parse(end))) end = row.timestamp;
    if (row.type === "response_item" && payload.type === "message") {
      const txt = textOf(payload.content);
      if (payload.role === "user" && txt) users.push(txt);
      if (payload.role === "assistant" && txt) assistants.push(txt);
    }
    if (row.type === "response_item" && ["function_call", "custom_tool_call"].includes(payload.type)) tools.push(payload.name || payload.tool_name);
    if (row.type === "response_item" && ["function_call_output", "custom_tool_call_output"].includes(payload.type) && payload.is_error) failures++;
    if (row.type === "event_msg" && payload.type === "user_message" && payload.message) fallbackUsers.push(payload.message);
    if (row.type === "event_msg" && payload.type === "exec_command_end" && payload.exit_code && payload.exit_code !== 0) failures++;
  }
  if (!meta) return null;
  return summarize({ adapterId: "codex", sessionId: meta.id || meta.session_id || path.basename(filename), cwd: meta.cwd, start, end, userTexts: users.length ? users : fallbackUsers, assistantTexts: assistants, models, tools, failures, recoveries, project });
}
function parseGemini(raw, filename, project) {
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
  const resolved = path.resolve(project);
  const candidates = [resolved, resolved.replace(/^\\\\\?\\/, ""), resolved.replaceAll("\\", "/"), resolved.replaceAll("\\", "/").replace(/^\/\//, "//")];
  if (!candidates.some((candidate) => hash(candidate) === record.projectHash)) return null;
  const users = [], assistants = [], models = new Set(), tools = [];
  let failures = 0;
  for (const message of record.messages || []) {
    const content = textOf(message.content);
    if (message.type === "user" && content) users.push(content);
    if (message.type === "gemini" && content) { assistants.push(content); if (message.model) models.add(message.model); }
    for (const call of message.toolCalls || []) { tools.push(call.name); if (call.error) failures++; }
    if (message.type === "error") failures++;
  }
  return summarize({ adapterId: "gemini-cli", sessionId: record.sessionId, cwd: project, start: record.startTime, end: record.lastUpdated || rows.at(-1)?.timestamp, userTexts: users, assistantTexts: assistants, models, tools, failures, recoveries: 0, project });
}

export const adapterMetadata = Object.fromEntries(Object.entries(ADAPTERS).map(([key, value]) => [key, { version: value.version, format: value.format }]));
