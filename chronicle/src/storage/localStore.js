import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, rename, rm, stat, lstat, readdir } from "node:fs/promises";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { validateEvent } from "../domain/schema.js";

export const MAX_STORE_BYTES = 5 * 1024 * 1024;
export const MAX_EVENTS = 25_000;
export const STORE_VERSION = 1;
export function storeDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "PawOS", "Chronicle");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "PawOS", "Chronicle");
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "pawos", "chronicle");
}
const dir = () => storeDirectory();

async function atomicWrite(target, data) {
  if (Buffer.byteLength(data) > MAX_STORE_BYTES) throw new Error("storage_limit_exceeded");
  const folder = path.dirname(target);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temp = path.join(folder, `.tmp-${randomUUID()}`);
  try { await writeFile(temp, data, { flag: "wx", mode: 0o600 }); await rename(temp, target); }
  catch (error) { await rm(temp, { force: true }); throw error; }
}

export async function loadManifest() {
  try {
    const parsed = JSON.parse(await readFile(path.join(dir(), "manifest.json"), "utf8"));
    if (parsed.version !== STORE_VERSION || !parsed.grants || typeof parsed.grants !== "object" || Object.keys(parsed.grants).length > 512) throw new Error("manifest_version_or_shape_invalid");
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { version: STORE_VERSION, grants: {} };
    throw new Error(`manifest_unavailable:${error.message}`);
  }
}
export async function saveManifest(manifest) {
  if (!manifest || manifest.version !== STORE_VERSION || !manifest.grants || typeof manifest.grants !== "object" || Object.keys(manifest.grants).length > 512) throw new Error("manifest_invalid_or_too_many_grants");
  await atomicWrite(path.join(dir(), "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function appendEvents(events) {
  if (!Array.isArray(events) || events.length > MAX_EVENTS) throw new Error("event_batch_limit_exceeded");
  for (const event of events) { const result = validateEvent(event); if (!result.ok) throw new Error(`invalid_event:${result.reason}`); }
  const target = path.join(dir(), "events-v1.jsonl");
  let existing = "";
  try {
    const current = await stat(target);
    if (current.size > MAX_STORE_BYTES) throw new Error("stored_events_over_limit");
    existing = await readFile(target, "utf8");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const next = existing + events.map(e => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  await atomicWrite(target, next);
  return { eventCount: events.length, bytes: Buffer.byteLength(next) };
}
export async function forgetAll() { await rm(dir(), { recursive: true, force: true }); }
export async function storageStatus() {
  try { const s = await stat(path.join(dir(), "events-v1.jsonl")); return { exists: true, bytes: s.size, maxBytes: MAX_STORE_BYTES }; }
  catch (error) { if (error.code === "ENOENT") return { exists: false, bytes: 0, maxBytes: MAX_STORE_BYTES }; throw error; }
}

export async function saveLocalReport(report, html) {
  if (!report || report.schemaVersion !== 2 || !/^[0-9a-f-]{36}$/i.test(report.reportId) || typeof html !== "string") throw new Error("report_invalid");
  if (Buffer.byteLength(JSON.stringify(report)) > 2 * 1024 * 1024 || Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error("report_too_large");
  const folder = path.join(dir(), "reports");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const id = report.reportId;
  const jsonPath = path.join(folder, `${id}.json`);
  const htmlPath = path.join(folder, `${id}.html`);
  if (path.dirname(jsonPath) !== folder || path.dirname(htmlPath) !== folder) throw new Error("report_path_invalid");
  await atomicWrite(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(htmlPath, html);
  return { jsonPath, htmlPath };
}

export async function saveDeveloperSummary(html) {
  if (typeof html !== "string" || Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error("developer_summary_invalid_or_too_large");
  const folder = path.join(dir(), "reports");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const target = path.join(folder, "developer-" + randomUUID() + ".html");
  await atomicWrite(target, html);
  return { htmlPath: target };
}

export async function listLocalReports() {
  const folder = path.join(dir(), "reports");
  let names;
  try { names = await readdir(folder); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const reports = [];
  for (const name of names.filter((item) => /^[0-9a-f-]{36}\.json$/i.test(item)).slice(-100).reverse()) {
    try {
      const raw = await readFile(path.join(folder, name), "utf8");
      if (Buffer.byteLength(raw) > 2 * 1024 * 1024) continue;
      const report = JSON.parse(raw);
      if (report.schemaVersion === 2 && report.reportId === name.slice(0, -5)) reports.push({ reportId: report.reportId, project: report.project.displayName, createdAt: report.createdAt, gitCommitCount: report.git.commitCount, agentSessionCount: report.agents?.metrics?.sessionCount ?? 0 });
    } catch { /* Ignore malformed local files without executing or trusting them. */ }
  }
  return reports;
}

export async function stableLocalProjectId(projectRoot) {
  const folder = dir();
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const saltPath = path.join(folder, "project-id-key");
  let salt;
  try {
    const info = await lstat(saltPath);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("project_identity_key_invalid");
    for (let attempt = 0; attempt < 20; attempt++) {
      salt = await readFile(saltPath, "utf8").catch(() => "");
      if (/^[a-f0-9]{64}$/.test(salt)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!/^[a-f0-9]{64}$/.test(salt)) throw new Error("project_identity_key_invalid");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const generated = randomBytes(32).toString("hex");
    try { await writeFile(saltPath, generated, { flag: "wx", mode: 0o600 }); salt = generated; }
    catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      for (let attempt = 0; attempt < 20; attempt++) {
        salt = await readFile(saltPath, "utf8").catch(() => "");
        if (/^[a-f0-9]{64}$/.test(salt)) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!/^[a-f0-9]{64}$/.test(salt)) throw new Error("project_identity_key_invalid");
    }
  }
  return createHmac("sha256", salt).update(path.resolve(projectRoot).toLowerCase()).digest("hex");
}
