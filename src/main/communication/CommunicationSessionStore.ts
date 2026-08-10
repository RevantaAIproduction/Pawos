import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { CommunicationRecord, RecordingMediaKind, RecordingTimelineEntry, EvidenceObject, BusinessInsight } from '../../shared/communication/CommunicationTypes';
import { hashFile } from '../execution/plugins/hashUtils';

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
      for (const field of ['audioPath', 'videoPath', 'transcriptPath', 'bodyPath', 'summaryPath'] as const) {
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

  /**
   * Every record still marked 'recording' at query time — meaningful only right after app launch,
   * before anything genuinely new has started: if the app just started, nothing can legitimately be
   * mid-recording yet, so any such record was left in that state by a previous process
   * crash/force-quit. The Recording & Storage Foundation's crash-recovery entry point
   * (CommunicationRuntime.recoverInterruptedRecordings()) calls this once at startup.
   */
  listStaleRecordingSessions(): CommunicationRecord[] {
    return this.records.filter((r) => r.status === 'recording');
  }

  /** Removes both the index entry AND the session's entire on-disk folder (audio/video/transcript/summary/attachments) — the real delete that CommunicationSessionStore.delete() never was. Never throws if the folder is already gone. */
  deleteSessionCompletely(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    const deleted = this.records.length !== before;
    if (deleted) {
      this.save();
      try {
        fs.rmSync(this.folderFor(id), { recursive: true, force: true });
      } catch {
        // Folder already gone or inaccessible — the index entry is still correctly removed either way.
      }
    }
    return deleted;
  }

  delete(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    const deleted = this.records.length !== before;
    if (deleted) this.save();
    return deleted;
  }

  // -- Streaming recording storage (Recording & Storage Foundation) ---------
  //
  // A recording chunk is appended to disk the moment it arrives — never
  // accumulated in memory first — via one plain fs.appendFileSync call per
  // chunk against a `.partial` file. This is deliberately stateless across
  // calls (no open file handle is held between IPC round-trips): simpler,
  // and crash-safe by construction, since there is never a dangling handle
  // to worry about if the renderer or main process dies mid-recording.

  private partialRecordingPath(communicationId: string, kind: RecordingMediaKind): string {
    return path.join(this.folderFor(communicationId), `${kind}.partial`);
  }

  hasPartialRecording(communicationId: string, kind: RecordingMediaKind): boolean {
    return fs.existsSync(this.partialRecordingPath(communicationId, kind));
  }

  appendRecordingChunk(communicationId: string, kind: RecordingMediaKind, frame: Buffer): void {
    this.ensureFolder(communicationId);
    fs.appendFileSync(this.partialRecordingPath(communicationId, kind), frame);
  }

  /** Truncates a partial recording file to its last complete frame boundary — used during crash recovery to discard a chunk that was only half-written to disk, never a fully-received one. No-op if the file doesn't exist or is already exactly at a valid boundary. */
  truncatePartialRecordingToBoundary(communicationId: string, kind: RecordingMediaKind, boundaryBytes: number): void {
    const partialPath = this.partialRecordingPath(communicationId, kind);
    if (!fs.existsSync(partialPath)) return;
    const stat = fs.statSync(partialPath);
    if (stat.size > boundaryBytes) fs.truncateSync(partialPath, boundaryBytes);
  }

  readPartialRecording(communicationId: string, kind: RecordingMediaKind): Buffer | null {
    const partialPath = this.partialRecordingPath(communicationId, kind);
    if (!fs.existsSync(partialPath)) return null;
    return fs.readFileSync(partialPath);
  }

  /**
   * Atomically finalizes a recording — renames the `.partial` file to its real name in one
   * filesystem operation, so a reader can never observe a "half-finalized" state (either the final
   * file exists complete, or it doesn't exist yet and `.partial` is still there). Returns the real
   * size in bytes, or null if there is no partial data to finalize (e.g. a recording that produced
   * zero chunks).
   */
  finalizeRecordingFile(communicationId: string, kind: RecordingMediaKind, finalRelativeName: string): { fullPath: string; sizeBytes: number } | null {
    const partialPath = this.partialRecordingPath(communicationId, kind);
    if (!fs.existsSync(partialPath)) return null;
    const finalPath = path.join(this.folderFor(communicationId), finalRelativeName);
    fs.renameSync(partialPath, finalPath);
    const sizeBytes = fs.statSync(finalPath).size;
    return { fullPath: finalPath, sizeBytes };
  }

  /** Streamed checksum (never loads the whole file into memory) over whatever bytes are actually on disk — reused unchanged from the existing file-integrity helper already proven for copy/move verification elsewhere in the app. */
  computeChecksum(fullPath: string): Promise<string> {
    return hashFile(fullPath);
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

  // -- Timeline Indexing (Phase 2) ------------------------------------------
  //
  // A structural recording-lifecycle timeline, append-only, one JSON object
  // per line (JSON Lines) — the same "never rewrite the whole file on every
  // event" discipline as the binary chunk storage above, so a multi-hour
  // recording with thousands of entries costs the same O(1)-per-event write
  // cost as a one-minute one. The only time this file is ever rewritten in
  // full is the one-time crash-recovery repair below.

  private timelineIndexPath(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'recording-timeline.jsonl');
  }

  /** Appends one real, already-computed timeline entry the instant it happens. Never buffers, never reads the file first. */
  appendTimelineEntry(communicationId: string, entry: RecordingTimelineEntry): void {
    this.ensureFolder(communicationId);
    fs.appendFileSync(this.timelineIndexPath(communicationId), `${JSON.stringify(entry)}\n`);
  }

  /**
   * Reads every valid, complete entry. A trailing incomplete line (the only way a JSON-Lines file
   * can be corrupted by a crash, since every earlier `fs.appendFileSync` call either fully completed
   * or the process died mid-syscall of the very last one) stops parsing rather than throwing or
   * skipping past it — a line after a corrupt one could itself be misaligned/meaningless, so nothing
   * past the first parse failure is trusted.
   */
  readTimelineEntries(communicationId: string): RecordingTimelineEntry[] {
    const filePath = this.timelineIndexPath(communicationId);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries: RecordingTimelineEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as RecordingTimelineEntry);
      } catch {
        break;
      }
    }
    return entries;
  }

  /**
   * Crash recovery: rewrites the timeline index to contain only its valid, complete-line prefix,
   * discarding a half-written trailing line (if any) — the one place this file is ever rewritten in
   * full, and only once, at startup, for a session that was mid-recording when the app crashed.
   * Idempotent: re-running against an already-valid file reproduces the same content byte-for-byte.
   */
  repairTimelineIndex(communicationId: string): void {
    const filePath = this.timelineIndexPath(communicationId);
    if (!fs.existsSync(filePath)) return;
    const entries = this.readTimelineEntries(communicationId);
    const repaired = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
    fs.writeFileSync(filePath, repaired, 'utf-8');
  }

  // -- Evidence Objects (Foundation Intelligence, Phase 3A) -----------------
  //
  // Immutable by construction: this section exposes only an append-during-
  // generation + atomic-finalize pair, never an update/rewrite of an
  // already-finalized evidence object. A generation run accumulates into
  // `evidence.partial.jsonl` (mirroring the exact discipline already proven
  // for streaming recording chunks and the Phase 2 timeline index), then is
  // atomically renamed to `evidence.jsonl` in one filesystem operation once
  // the whole batch is durably appended — so a crash mid-generation leaves
  // only a `.partial` file, never a half-finalized `evidence.jsonl`. Recovery
  // discards a stale `.partial` (see discardPartialEvidence) and lets
  // generation restart cleanly, since the source recording itself is
  // untouched and reprocessing is always safe (never duplicative once
  // `evidence.jsonl` exists, per hasEvidence's own gate in the pipeline).

  private evidencePartialPath(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'evidence.partial.jsonl');
  }

  private evidenceFinalPath(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'evidence.jsonl');
  }

  /** True once a generation run has fully completed and been atomically finalized — the gate that makes reprocessing a safe no-op. */
  hasEvidence(communicationId: string): boolean {
    return fs.existsSync(this.evidenceFinalPath(communicationId));
  }

  /** A `.partial` file left behind by a crashed prior run (never a currently-running one within this process — that's guarded separately, in-memory, by the caller). */
  hasPartialEvidence(communicationId: string): boolean {
    return fs.existsSync(this.evidencePartialPath(communicationId));
  }

  /** Appends one already-computed, immutable Evidence Object during generation — never buffers, never reads the file first, same O(1)-per-append discipline as chunk storage and the timeline index. */
  appendEvidencePartial(communicationId: string, evidence: EvidenceObject): void {
    this.ensureFolder(communicationId);
    fs.appendFileSync(this.evidencePartialPath(communicationId), `${JSON.stringify(evidence)}\n`);
  }

  /** Crash-safety: discards a stale `.partial` file from an interrupted prior run, so a fresh generation attempt starts from a clean slate rather than resuming into (or duplicating on top of) unknown partial state. Safe no-op if no partial file exists. */
  discardPartialEvidence(communicationId: string): void {
    try {
      fs.rmSync(this.evidencePartialPath(communicationId), { force: true });
    } catch {
      // Already gone or inaccessible — nothing to discard.
    }
  }

  /**
   * Atomically finalizes one generation run: renames `.partial` to the real filename in one
   * filesystem operation (so a reader can never observe a half-finalized state), or — the honest
   * "this recording genuinely produced zero evidence" case (e.g. silence, a zero-length recording) —
   * writes an empty finalized file directly, since no partial file was ever created for zero appends.
   * A no-op if evidence is already finalized (never overwrites real, already-completed evidence).
   */
  finalizeEvidence(communicationId: string): void {
    if (this.hasEvidence(communicationId)) return;
    this.ensureFolder(communicationId);
    const partialPath = this.evidencePartialPath(communicationId);
    const finalPath = this.evidenceFinalPath(communicationId);
    if (fs.existsSync(partialPath)) {
      fs.renameSync(partialPath, finalPath);
    } else {
      fs.writeFileSync(finalPath, '', 'utf-8');
    }
  }

  /**
   * Reads every valid, complete Evidence Object from the FINALIZED file only — a `.partial` file is
   * never read as if it were real evidence, even if it exists (it represents either an in-flight or
   * a crashed, discarded run). Stops at the first unparseable line rather than throwing or skipping
   * past it, mirroring readTimelineEntries()'s exact discipline.
   */
  readEvidence(communicationId: string): EvidenceObject[] {
    const filePath = this.evidenceFinalPath(communicationId);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries: EvidenceObject[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as EvidenceObject);
      } catch {
        break;
      }
    }
    return entries;
  }

  // -- Business Insights (Business Intelligence, Phase 3B) -------------------
  //
  // Identical atomic-finalize discipline to the Evidence Objects section above,
  // one level up the stack: business-insights.partial.jsonl accumulates during a
  // generation run, then is atomically renamed to business-insights.jsonl once
  // the whole batch is durably appended. Kept as a wholly separate file/pair
  // from evidence.jsonl — Business Insights are a different, deliberately later
  // stage of processing with its own idempotency/crash-recovery lifecycle, never
  // sharing a file with the evidence layer it reads from.

  private businessInsightsPartialPath(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'business-insights.partial.jsonl');
  }

  private businessInsightsFinalPath(communicationId: string): string {
    return path.join(this.folderFor(communicationId), 'business-insights.jsonl');
  }

  hasBusinessInsights(communicationId: string): boolean {
    return fs.existsSync(this.businessInsightsFinalPath(communicationId));
  }

  hasPartialBusinessInsights(communicationId: string): boolean {
    return fs.existsSync(this.businessInsightsPartialPath(communicationId));
  }

  appendBusinessInsightPartial(communicationId: string, insight: BusinessInsight): void {
    this.ensureFolder(communicationId);
    fs.appendFileSync(this.businessInsightsPartialPath(communicationId), `${JSON.stringify(insight)}\n`);
  }

  discardPartialBusinessInsights(communicationId: string): void {
    try {
      fs.rmSync(this.businessInsightsPartialPath(communicationId), { force: true });
    } catch {
      // Already gone or inaccessible — nothing to discard.
    }
  }

  /** Same honest-empty-file / no-op-if-already-finalized discipline as finalizeEvidence(). */
  finalizeBusinessInsights(communicationId: string): void {
    if (this.hasBusinessInsights(communicationId)) return;
    this.ensureFolder(communicationId);
    const partialPath = this.businessInsightsPartialPath(communicationId);
    const finalPath = this.businessInsightsFinalPath(communicationId);
    if (fs.existsSync(partialPath)) {
      fs.renameSync(partialPath, finalPath);
    } else {
      fs.writeFileSync(finalPath, '', 'utf-8');
    }
  }

  readBusinessInsights(communicationId: string): BusinessInsight[] {
    const filePath = this.businessInsightsFinalPath(communicationId);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entries: BusinessInsight[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as BusinessInsight);
      } catch {
        break;
      }
    }
    return entries;
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
