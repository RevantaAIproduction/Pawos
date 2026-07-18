import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { CommunicationRecord } from '../../shared/communication/CommunicationTypes';

const INDEX_FILE_NAME = 'communications.db';

/**
 * Storage Layer (architecture doc §6) — the split between binary content
 * (audio/transcript/attachments as real files on disk, per communication
 * folder) and structured metadata (this store's own JSON index), same
 * discipline as ConversationSessionStore: an in-memory array, persisted to
 * one JSON file, the structured index never embeds large binary content,
 * only a path reference into the recordings folder.
 */
class CommunicationSessionStore {
  private rootDir = '';
  private indexPath = '';
  private records: CommunicationRecord[] = [];

  init(): void {
    this.rootDir = path.join(app.getPath('userData'), 'communication');
    this.indexPath = path.join(this.rootDir, 'index', INDEX_FILE_NAME);
    // Real scaffolding for every top-level area the desktop-first storage
    // architecture defines — created once, empty until something real
    // writes into it (exports/cache/temp are legitimate, currently-unused
    // future extension points, not fabricated features).
    for (const dir of ['sessions', 'index', 'exports', 'cache', 'temp']) {
      fs.mkdirSync(path.join(this.rootDir, dir), { recursive: true });
    }
    this.migrateLegacyRecordingsFolder();
    this.load();
    this.migrateLegacyPathReferences();
  }

  /** One-time migration for any pre-existing communication/recordings/&lt;id&gt; folders from before the sessions/ rename — moves them across intact rather than losing real captured audio/transcripts. Safe to call every startup: a no-op once recordings/ no longer exists. */
  private migrateLegacyRecordingsFolder(): void {
    const legacyDir = path.join(this.rootDir, 'recordings');
    if (!fs.existsSync(legacyDir)) return;
    const sessionsDir = path.join(this.rootDir, 'sessions');
    for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dest = path.join(sessionsDir, entry.name);
      if (fs.existsSync(dest)) continue;
      fs.renameSync(path.join(legacyDir, entry.name), dest);
    }
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }

  /** Companion to migrateLegacyRecordingsFolder() — moving the folders on disk doesn't rewrite the path STRINGS already stored on each record (audioPath/transcriptPath/bodyPath/summaryPath), so any record created before the sessions/ rename would otherwise keep pointing at a folder that no longer exists. Rewrites every stale "\recordings\" (or "/recordings/") segment to "\sessions\"/"/sessions/" once, in place. */
  private migrateLegacyPathReferences(): void {
    const legacySegment = `${path.sep}recordings${path.sep}`;
    const newSegment = `${path.sep}sessions${path.sep}`;
    let changed = false;
    for (const record of this.records) {
      for (const field of ['audioPath', 'transcriptPath', 'bodyPath', 'summaryPath'] as const) {
        const value = record[field];
        if (typeof value === 'string' && value.includes(legacySegment)) {
          record[field] = value.replace(legacySegment, newSegment);
          changed = true;
        }
      }
    }
    if (changed) this.save();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      this.records = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
    fs.writeFileSync(this.indexPath, JSON.stringify({ records: this.records }, null, 2), 'utf-8');
  }

  /** Real, self-contained per-session folder — every real artifact (audio, transcript, summary, per-session action-items/decisions/followups/signals/timeline, attachments, screenshots) lives here, never scattered. */
  folderFor(communicationId: string): string {
    return path.join(this.rootDir, 'sessions', communicationId);
  }

  attachmentsFolderFor(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'attachments');
  }

  screenshotsFolderFor(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'screenshots');
  }

  ensureFolder(communicationId: string): void {
    fs.mkdirSync(this.folderFor(communicationId), { recursive: true });
    fs.mkdirSync(this.attachmentsFolderFor(communicationId), { recursive: true });
    fs.mkdirSync(this.screenshotsFolderFor(communicationId), { recursive: true });
  }

  /** metadata.json — the session's own self-contained copy of its record, so a session folder is understandable on its own without reading the global index. Written on create and every update, never a second source of truth (always exactly what's in communications.db for this id). */
  private writeMetadata(record: CommunicationRecord): void {
    const fullPath = path.join(this.folderFor(record.id), 'metadata.json');
    fs.writeFileSync(fullPath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /** Generic per-session JSON file writer — used for action-items.json/decisions.json/followups.json/signals.json/timeline.json. */
  writeSessionJson(communicationId: string, relativeName: string, data: unknown): string {
    this.ensureFolder(communicationId);
    const fullPath = path.join(this.folderFor(communicationId), relativeName);
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    return fullPath;
  }

  readSessionJson<T>(communicationId: string, relativeName: string): T | null {
    try {
      const raw = fs.readFileSync(path.join(this.folderFor(communicationId), relativeName), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  create(record: CommunicationRecord): CommunicationRecord {
    this.ensureFolder(record.id);
    this.records.push(record);
    this.save();
    this.writeMetadata(record);
    return record;
  }

  get(id: string): CommunicationRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  update(id: string, patch: Partial<CommunicationRecord>): CommunicationRecord | undefined {
    const record = this.get(id);
    if (!record) return undefined;
    Object.assign(record, patch, { updatedAt: Date.now() });
    this.save();
    this.writeMetadata(record);
    return record;
  }

  list(): CommunicationRecord[] {
    return [...this.records].sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Every record whose pipeline never reached 'done' — the entry point for crash recovery (architecture doc §18). */
  listUnfinished(): CommunicationRecord[] {
    return this.records.filter((r) => (r.status === 'interrupted' || r.status === 'processing' || r.status === 'recording') && r.pipelineStage !== 'done');
  }

  delete(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    const deleted = this.records.length !== before;
    if (deleted) this.save();
    return deleted;
  }

  writeTextFile(communicationId: string, relativeName: string, content: string): string {
    this.ensureFolder(communicationId);
    const fullPath = path.join(this.folderFor(communicationId), relativeName);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  readTextFile(fullPath: string): string | null {
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  writeBinaryFile(communicationId: string, relativeName: string, data: Buffer): string {
    this.ensureFolder(communicationId);
    const fullPath = path.join(this.folderFor(communicationId), relativeName);
    fs.writeFileSync(fullPath, data);
    return fullPath;
  }

  copyAttachment(communicationId: string, sourcePath: string): string {
    const folder = this.attachmentsFolderFor(communicationId);
    fs.mkdirSync(folder, { recursive: true });
    const dest = path.join(folder, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, dest);
    return dest;
  }
}

export const communicationSessionStore = new CommunicationSessionStore();
