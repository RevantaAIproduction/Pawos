import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { diffLines, type Change } from 'diff';
import type {
  CodeChangeDiff,
  CodeChangeEntry,
  CodeChangeEvent,
  CodeChangeLedger,
  CodeChangeOperation,
  CodeChangeRevertResult,
  CodeChangeStatus,
  CodeChangeSummary,
  DiffHunk,
  DiffLine,
  FileSnapshotRef,
} from '../../../shared/actions/CodeChangeTypes';
import { revertAvailability } from '../../../shared/actions/CodeChangeTypes';
import { isSecretFile } from '../plugins/ReadFilePlugin';

/**
 * The per-task change ledger (Live Code Changes). Captures real before/after snapshots at the main
 * process's own file-operation boundary — DesktopExecutionEngine calls `beforeAction` just before a
 * file-changing plugin runs and `afterAction` once its result is known — so a change is attributed to
 * a task only when that task's own operation made it. Commands/builds are counted, never attributed.
 *
 * Storage (under userData/code-changes): one JSON ledger per execution, and content-addressed blobs
 * (sha256 of the exact bytes) for text snapshots — the same content is stored once. Secret files
 * (.env, keys…), binary files, symlinks, folders and anything over the size limit are recorded by
 * metadata only: their content is never stored, sent to the renderer or diffed (and a secret file's
 * hash never leaves the main process).
 *
 * Every ledger belongs to the account that was signed in (verified by the main process) when it was
 * created. Only that account can read, extend or revert it; a ledger without an account is never
 * readable. Line counts and diffs are computed asynchronously (in chunks) so a large file never
 * blocks the main process.
 */

/** Text larger than this is not stored or diffed (its hash is still recorded for conflict checks). */
export const MAX_STORED_BYTES = 1024 * 1024;
/** Files larger than this are not even hashed (a revert/conflict check is then impossible and says so). */
const MAX_HASHED_BYTES = 20 * 1024 * 1024;
/** Diffs compare at most this many lines per side; beyond it the diff is marked truncated. */
const MAX_DIFF_LINES = 20_000;
const MAX_EVENTS_PER_LEDGER = 500;
export const MAX_LEDGERS = 200;
/** Ledgers kept in memory (the rest are re-read from disk when needed). */
const MAX_CACHED_LEDGERS = 50;
/** A blob written this recently is never collected (it may belong to a capture still in progress). */
const BLOB_GRACE_MS = 10 * 60_000;
const EXECUTION_ID = /^[A-Za-z0-9-]{8,64}$/;

export const FILE_CHANGE_ACTION_TYPES = new Set(['applyCodeEdit', 'writeFile', 'deletePath', 'movePath']);
/** Actions that can change files in ways PawOS does not attribute per file. */
export const UNTRACKED_CHANGE_ACTION_TYPES = new Set(['runCommand', 'buildProject', 'runValidationPipeline', 'startProcess', 'runDeployScript']);

type CapturedPath = { abs: string; rel: string };
export type CaptureToken = {
  executionId: string;
  accountId: string;
  actionType: string;
  operation: CodeChangeOperation;
  paths: CapturedPath[];
  /** Baselines taken just before the operation, for paths the ledger did not track yet. */
  baselines: Map<string, FileSnapshotRef>;
};

const toPosix = (value: string) => value.split(path.sep).join('/');
const sha256 = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function looksBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8000);
  for (let i = 0; i < limit; i += 1) if (buffer[i] === 0) return true;
  return false;
}

function sameSnapshot(a: FileSnapshotRef, b: FileSnapshotRef): boolean {
  if (a.exists !== b.exists) return false;
  if (!a.exists) return true;
  if (a.hash && b.hash) return a.hash === b.hash;
  // Neither hashable (directory, symlink, too large): equal only when both are the same kind and size.
  return a.hash === b.hash && a.hiddenReason === b.hiddenReason && a.size === b.size;
}

function statusOf(entry: Pick<CodeChangeEntry, 'baseline' | 'final' | 'path' | 'originalPath'>): CodeChangeStatus {
  const { baseline, final } = entry;
  if (!baseline.exists && !final.exists) return 'unchanged';
  if (!baseline.exists) return 'created';
  if (!final.exists) return 'deleted';
  if (entry.path !== entry.originalPath) return 'renamed';
  return sameSnapshot(baseline, final) ? 'unchanged' : 'modified';
}

/** Real path of a path that may not exist yet: its nearest existing ancestor resolved, the rest appended. */
function realPathLoose(target: string): string {
  const resolved = path.resolve(target);
  let existing = resolved;
  const rest: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return resolved;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync.native(existing), ...rest);
  } catch {
    return resolved;
  }
}

/** Markers of a project's root folder. */
const ROOT_MARKERS = ['package.json', '.git', 'pyproject.toml'];

/** The nearest ancestor of `abs` that looks like a project root, or null. */
export function projectRootFor(abs: string): string | null {
  let dir = path.dirname(abs);
  for (let i = 0; i < 25; i += 1) {
    if (ROOT_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** Deepest folder containing both; null when there is none (different drives). */
function commonAncestor(a: string, b: string): string | null {
  let dir = a;
  for (;;) {
    if (dir === b || insideRoot(dir, b)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function insideRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Line diff without blocking: jsdiff's chunked async mode (it yields to the event loop between chunks). */
function diffLinesAsync(before: string, after: string): Promise<Change[]> {
  return new Promise((resolve) => {
    diffLines(before, after, { callback: (_err: unknown, changes: Change[] | undefined) => resolve(changes ?? []) } as never);
  });
}

function splitLines(value: string): string[] {
  const parts = value.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** Unified-diff hunks (with `context` unchanged lines around each change) from a line diff — jsdiff's numbering. */
export function buildHunks(changes: Change[], context: number): DiffHunk[] {
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const change of changes) {
    for (const text of splitLines(change.value)) {
      if (change.added) lines.push({ kind: 'add', text, oldLine: null, newLine: newLine++ });
      else if (change.removed) lines.push({ kind: 'remove', text, oldLine: oldLine++, newLine: null });
      else lines.push({ kind: 'context', text, oldLine: oldLine++, newLine: newLine++ });
    }
  }
  const changed = lines.map((line, index) => (line.kind === 'context' ? -1 : index)).filter((index) => index >= 0);
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < changed.length) {
    const first = changed[i] ?? 0;
    let last = first;
    while (i + 1 < changed.length && (changed[i + 1] ?? 0) - last <= context * 2 + 1) {
      i += 1;
      last = changed[i] ?? last;
    }
    i += 1;
    const start = Math.max(0, first - context);
    const end = Math.min(lines.length - 1, last + context);
    const slice = lines.slice(start, end + 1);
    // Old/new line numbers just before this hunk (numbering of the first line it covers).
    let oldBefore = 0;
    let newBefore = 0;
    for (let k = 0; k < start; k += 1) {
      if (lines[k]?.oldLine !== null) oldBefore += 1;
      if (lines[k]?.newLine !== null) newBefore += 1;
    }
    hunks.push({
      oldStart: oldBefore + 1,
      oldLines: slice.filter((l) => l.oldLine !== null).length,
      newStart: newBefore + 1,
      newLines: slice.filter((l) => l.newLine !== null).length,
      lines: slice,
    });
  }
  return hunks;
}

/** A snapshot as the renderer may see it: a secret file's content hash never leaves the main process. */
function forRenderer(ref: FileSnapshotRef): FileSnapshotRef {
  return ref.hiddenReason === 'secret' ? { ...ref, hash: null } : ref;
}
function entryForRenderer(entry: CodeChangeEntry): CodeChangeEntry {
  return { ...entry, baseline: forRenderer(entry.baseline), final: forRenderer(entry.final) };
}
function eventForRenderer(event: CodeChangeEvent): CodeChangeEvent {
  return { ...event, entry: event.entry ? entryForRenderer(event.entry) : null };
}

export class CodeChangeLedgerStore {
  private readonly ledgersDir: string;
  private readonly blobsDir: string;
  private readonly cache = new Map<string, CodeChangeLedger>();

  constructor(
    rootDir: string,
    private readonly deps: {
      /** The signed-in account, as verified by the main process (null when signed out or unverified). */
      getAccountId: () => string | null;
      moveToTrash: (absPath: string) => Promise<unknown>;
      now?: () => number;
      /**
       * The Coding Runtime's own file boundary check, applied to every path a revert writes or moves
       * (null = allowed, otherwise the reason it is refused). Defaults to "allowed" (the ledger's own
       * root/real-path/symlink checks still apply).
       */
      checkWriteBoundary?: (absPath: string, projectRoot: string) => string | null;
      /** True while any task step is running — a revert then waits, so it can't race a task's write. */
      isBusy?: () => boolean;
    }
  ) {
    this.ledgersDir = path.join(rootDir, 'ledgers');
    this.blobsDir = path.join(rootDir, 'blobs');
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  // ── snapshots ────────────────────────────────────────────────────────────────────────────────
  /** Records what is at `abs` right now. Never follows a symlink; stores text content only when allowed. */
  snapshot(abs: string): FileSnapshotRef {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      return { exists: false, hash: null, size: null, content: 'none' };
    }
    if (stat.isSymbolicLink()) return { exists: true, hash: null, size: null, content: 'hidden', hiddenReason: 'symlink' };
    if (stat.isDirectory()) return { exists: true, hash: null, size: null, content: 'hidden', hiddenReason: 'directory' };
    if (!stat.isFile()) return { exists: true, hash: null, size: stat.size, content: 'hidden', hiddenReason: 'unreadable' };
    if (stat.size > MAX_HASHED_BYTES) return { exists: true, hash: null, size: stat.size, content: 'hidden', hiddenReason: 'too_large' };
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(abs);
    } catch {
      return { exists: true, hash: null, size: stat.size, content: 'hidden', hiddenReason: 'unreadable' };
    }
    const hash = sha256(buffer);
    if (isSecretFile(abs)) return { exists: true, hash, size: buffer.length, content: 'hidden', hiddenReason: 'secret' };
    if (buffer.length > MAX_STORED_BYTES) return { exists: true, hash, size: buffer.length, content: 'hidden', hiddenReason: 'too_large' };
    if (looksBinary(buffer)) return { exists: true, hash, size: buffer.length, content: 'hidden', hiddenReason: 'binary' };
    this.storeBlob(hash, buffer);
    return { exists: true, hash, size: buffer.length, content: 'stored' };
  }

  private storeBlob(hash: string, buffer: Buffer): void {
    const file = path.join(this.blobsDir, hash);
    if (fs.existsSync(file)) {
      // Still in use: refresh its age so the collector's grace period protects it.
      try {
        const at = new Date();
        fs.utimesSync(file, at, at);
      } catch {
        // best effort
      }
      return;
    }
    fs.mkdirSync(this.blobsDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, buffer);
    try {
      fs.renameSync(tmp, file);
    } catch {
      fs.rmSync(tmp, { force: true });
    }
  }

  /** The exact bytes of a stored snapshot (empty for "did not exist"); null when not stored or missing. */
  private readBlobBytes(ref: FileSnapshotRef): Buffer | null {
    if (!ref.exists) return Buffer.alloc(0);
    if (ref.content !== 'stored' || !ref.hash || !/^[0-9a-f]{64}$/.test(ref.hash)) return null;
    try {
      const bytes = fs.readFileSync(path.join(this.blobsDir, ref.hash));
      return sha256(bytes) === ref.hash ? bytes : null;
    } catch {
      return null;
    }
  }

  /** A stored snapshot as text, for diffs and counts only (never written back — revert uses the bytes). */
  private readBlobText(ref: FileSnapshotRef): string | null {
    const bytes = this.readBlobBytes(ref);
    return bytes === null ? null : bytes.toString('utf-8');
  }

  // ── ledgers ──────────────────────────────────────────────────────────────────────────────────
  private ledgerFile(executionId: string): string {
    return path.join(this.ledgersDir, `${executionId}.json`);
  }

  private load(executionId: string): CodeChangeLedger | null {
    if (!EXECUTION_ID.test(executionId)) return null;
    const cached = this.cache.get(executionId);
    if (cached) {
      this.remember(cached);
      return cached;
    }
    try {
      const ledger = JSON.parse(fs.readFileSync(this.ledgerFile(executionId), 'utf-8')) as CodeChangeLedger;
      if (ledger.executionId !== executionId) return null;
      this.remember(ledger);
      return ledger;
    } catch {
      return null;
    }
  }

  private remember(ledger: CodeChangeLedger): void {
    this.cache.delete(ledger.executionId);
    this.cache.set(ledger.executionId, ledger);
    while (this.cache.size > MAX_CACHED_LEDGERS) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private save(ledger: CodeChangeLedger): void {
    fs.mkdirSync(this.ledgersDir, { recursive: true });
    const file = this.ledgerFile(ledger.executionId);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, file);
    this.remember(ledger);
  }

  /** A new ledger in memory, owned by `accountId`. It is written by the caller's save(), and only then pruned. */
  private getOrCreate(executionId: string, projectRoot: string, accountId: string): CodeChangeLedger {
    const existing = this.load(executionId);
    if (existing) return existing;
    const at = this.now();
    return {
      executionId,
      accountId,
      projectRoot,
      createdAt: at,
      updatedAt: at,
      seq: 0,
      entries: [],
      events: [],
      untrackedCommandCount: 0,
    };
  }

  /** The signed-in, verified account may use only its own ledgers. A ledger without an account is never usable. */
  private owned(ledger: CodeChangeLedger | null): CodeChangeLedger | null {
    if (!ledger) return null;
    const account = this.deps.getAccountId();
    return account !== null && ledger.accountId !== null && ledger.accountId === account ? ledger : null;
  }

  /**
   * Oldest ledgers beyond the limit are dropped, then blobs no ledger references any more (and that
   * are older than the grace period). Called only after the current ledger has been saved, so its
   * own snapshots are always referenced.
   */
  private prune(): void {
    let files: string[];
    try {
      files = fs.readdirSync(this.ledgersDir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    if (files.length <= MAX_LEDGERS) return;
    const byAge = files
      .map((f) => ({ f, at: fs.statSync(path.join(this.ledgersDir, f)).mtimeMs }))
      .sort((a, b) => a.at - b.at);
    for (const { f } of byAge.slice(0, files.length - MAX_LEDGERS)) {
      fs.rmSync(path.join(this.ledgersDir, f), { force: true });
      this.cache.delete(f.replace(/\.json$/, ''));
    }
    this.collectBlobs();
  }

  collectBlobs(): void {
    const referenced = new Set<string>();
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.ledgersDir).filter((f) => f.endsWith('.json'));
    } catch {
      // no ledgers yet
    }
    for (const f of files) {
      try {
        const ledger = JSON.parse(fs.readFileSync(path.join(this.ledgersDir, f), 'utf-8')) as CodeChangeLedger;
        for (const entry of ledger.entries) {
          if (entry.baseline.hash) referenced.add(entry.baseline.hash);
          if (entry.final.hash) referenced.add(entry.final.hash);
        }
      } catch {
        // an unreadable ledger keeps nothing alive
      }
    }
    let blobs: string[] = [];
    try {
      blobs = fs.readdirSync(this.blobsDir);
    } catch {
      return;
    }
    const cutoff = Date.now() - BLOB_GRACE_MS;
    for (const blob of blobs) {
      if (referenced.has(blob)) continue;
      const file = path.join(this.blobsDir, blob);
      try {
        if (fs.statSync(file).mtimeMs > cutoff) continue;
      } catch {
        continue;
      }
      fs.rmSync(file, { force: true });
    }
  }

  private async computeCounts(entry: CodeChangeEntry): Promise<{ added: number | null; removed: number | null }> {
    const before = this.readBlobText(entry.baseline);
    const after = this.readBlobText(entry.final);
    if (before === null || after === null) return { added: null, removed: null };
    let added = 0;
    let removed = 0;
    for (const part of await diffLinesAsync(before, after)) {
      if (part.added) added += part.count ?? 0;
      else if (part.removed) removed += part.count ?? 0;
    }
    return { added, removed };
  }

  private async refresh(entry: CodeChangeEntry, seq: number, at: number): Promise<CodeChangeEntry> {
    const next = { ...entry, lastSeq: seq, updatedAt: at };
    next.status = statusOf(next);
    const counts = await this.computeCounts(next);
    next.added = counts.added;
    next.removed = counts.removed;
    return next;
  }

  private pushEvent(ledger: CodeChangeLedger, event: Omit<CodeChangeEvent, 'executionId' | 'seq' | 'at'>, at: number): CodeChangeEvent {
    ledger.seq += 1;
    const full: CodeChangeEvent = { executionId: ledger.executionId, seq: ledger.seq, at, ...event };
    ledger.events.push(full);
    if (ledger.events.length > MAX_EVENTS_PER_LEDGER) ledger.events = ledger.events.slice(-MAX_EVENTS_PER_LEDGER);
    ledger.updatedAt = at;
    return full;
  }

  // ── capture ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Called just before a file-changing action runs. Returns null (nothing captured) when no account
   * is signed in, for a ledger another account owns, for actions it does not track, or for paths
   * that cannot be attributed to one root.
   */
  beforeAction(executionId: string, request: { type: string } & Record<string, unknown>, fallbackRoot: string): CaptureToken | null {
    if (!EXECUTION_ID.test(executionId) || !FILE_CHANGE_ACTION_TYPES.has(request.type)) return null;
    const accountId = this.deps.getAccountId();
    if (!accountId) return null;
    const rawPaths = request.type === 'movePath' ? [request.from, request.to] : [request.path];
    if (!rawPaths.every((p) => typeof p === 'string' && p.length > 0)) return null;
    const absPaths = (rawPaths as string[]).map((raw) => realPathLoose(raw));

    const firstAbs = absPaths[0];
    if (!firstAbs) return null;
    let ledger = this.load(executionId);
    if (ledger && ledger.accountId !== accountId) return null;
    // The ledger's root: the project the first file belongs to (or the security gate's root); it
    // widens to a common ancestor if a later file of the same task lives outside it.
    let root = ledger?.projectRoot ?? realPathLoose(projectRootFor(firstAbs) ?? fallbackRoot);
    for (const abs of absPaths) {
      if (insideRoot(root, abs)) continue;
      const widened = commonAncestor(root, path.dirname(abs));
      if (!widened) return null; // e.g. another drive: not attributable to one root
      root = widened;
    }
    if (ledger && ledger.projectRoot !== root) {
      this.rebase(ledger, root);
      ledger = this.load(executionId);
    }
    const paths: CapturedPath[] = absPaths.map((abs) => ({ abs, rel: toPosix(path.relative(root, abs)) }));
    const baselines = new Map<string, FileSnapshotRef>();
    for (const p of paths) {
      if (!ledger?.entries.some((e) => e.path === p.rel)) baselines.set(p.rel, this.snapshot(p.abs));
    }
    const operation: CodeChangeOperation =
      request.type === 'applyCodeEdit' ? 'edit' : request.type === 'deletePath' ? 'delete' : request.type === 'movePath' ? 'move' : 'write';
    return { executionId, accountId, actionType: request.type, operation, paths, baselines };
  }

  /** Re-expresses every path of a ledger relative to a wider root. */
  private rebase(ledger: CodeChangeLedger, newRoot: string): void {
    const move = (rel: string) => toPosix(path.relative(newRoot, path.join(ledger.projectRoot, rel)));
    ledger.entries = ledger.entries.map((e) => ({ ...e, path: move(e.path), originalPath: move(e.originalPath) }));
    ledger.events = ledger.events.map((e) => ({
      ...e,
      path: move(e.path),
      ...(e.previousPath ? { previousPath: move(e.previousPath) } : {}),
      entry: e.entry ? { ...e.entry, path: move(e.entry.path), originalPath: move(e.entry.originalPath) } : null,
    }));
    ledger.projectRoot = newRoot;
    this.save(ledger);
  }

  /**
   * Called once the action's result is known. Reads what is really on disk now; returns the events it
   * recorded (as the renderer may see them). A later change to a reverted file clears its revert mark.
   */
  async afterAction(token: CaptureToken, result: { ok: boolean; reason?: string }): Promise<CodeChangeEvent[]> {
    const first = token.paths[0];
    if (!first) return [];
    // Signed out (or another account) since the capture began: record nothing for it.
    if (this.deps.getAccountId() !== token.accountId) return [];
    const root = path.resolve(first.abs.slice(0, first.abs.length - first.rel.length));
    const at = this.now();
    const ledger = this.getOrCreate(token.executionId, root, token.accountId);
    if (ledger.accountId !== token.accountId) return [];
    const isNew = !this.cache.has(token.executionId) && !fs.existsSync(this.ledgerFile(token.executionId));
    const outcome: CodeChangeEvent['result'] = result.ok ? 'completed' : result.reason === 'cancelled' ? 'cancelled' : 'failed';
    const events: CodeChangeEvent[] = [];
    const findIndex = (rel: string) => ledger.entries.findIndex((e) => e.path === rel);
    const fresh = (p: CapturedPath): CodeChangeEntry => {
      const baseline = token.baselines.get(p.rel) ?? { exists: false, hash: null, size: null, content: 'none' as const };
      return { path: p.rel, originalPath: p.rel, baseline, final: baseline, status: 'unchanged', added: 0, removed: 0, lastSeq: 0, updatedAt: at };
    };
    /** A new change supersedes an earlier revert of the same file. */
    const changed = (entry: CodeChangeEntry, final: FileSnapshotRef): CodeChangeEntry => {
      const { revertedAt: _revertedAt, ...rest } = entry;
      void _revertedAt;
      return { ...rest, final };
    };

    if (token.operation === 'move') {
      const [from, to] = token.paths;
      if (!from || !to) return [];
      const fromNow = this.snapshot(from.abs);
      const toNow = this.snapshot(to.abs);
      const fromIndex = findIndex(from.rel);
      const fromEntry = (fromIndex >= 0 ? ledger.entries[fromIndex] : undefined) ?? fresh(from);
      const toIndex = findIndex(to.rel);
      const toEntry = (toIndex >= 0 ? ledger.entries[toIndex] : undefined) ?? fresh(to);
      const moved = !fromNow.exists && toNow.exists;
      if (!moved) return []; // nothing moved (refused, failed, cancelled before it ran)
      if (toEntry.baseline.exists) {
        // The target already existed before this task touched it: the source is deleted, the target modified.
        ledger.entries = ledger.entries.filter((e) => e.path !== from.rel && e.path !== to.rel);
        const seqA = ledger.seq + 1;
        const a = await this.refresh(changed(fromEntry, fromNow), seqA, at);
        const b = await this.refresh(changed(toEntry, toNow), seqA + 1, at);
        if (a.status !== 'unchanged' || fromIndex >= 0) ledger.entries.push(a);
        ledger.entries.push(b);
        events.push(this.pushEvent(ledger, { operation: 'move', actionType: token.actionType, path: from.rel, result: outcome, entry: a }, at));
        events.push(this.pushEvent(ledger, { operation: 'move', actionType: token.actionType, path: to.rel, previousPath: from.rel, result: outcome, entry: b }, at));
      } else {
        // A rename: the source's history moves with it (its baseline stays at the original path).
        ledger.entries = ledger.entries.filter((e) => e.path !== from.rel && e.path !== to.rel);
        const next = await this.refresh({ ...changed(fromEntry, toNow), path: to.rel }, ledger.seq + 1, at);
        ledger.entries.push(next);
        events.push(this.pushEvent(ledger, { operation: 'move', actionType: token.actionType, path: to.rel, previousPath: from.rel, result: outcome, entry: next }, at));
      }
    } else {
      for (const p of token.paths) {
        const now = this.snapshot(p.abs);
        const index = findIndex(p.rel);
        const entry = (index >= 0 ? ledger.entries[index] : undefined) ?? fresh(p);
        if (index < 0 && sameSnapshot(entry.baseline, now)) continue; // nothing changed, nothing tracked
        if (index >= 0 && sameSnapshot(entry.final, now)) continue; // no change since the last record
        const next = await this.refresh(changed(entry, now), ledger.seq + 1, at);
        const current = findIndex(p.rel);
        if (current >= 0) ledger.entries[current] = next;
        else ledger.entries.push(next);
        events.push(this.pushEvent(ledger, { operation: token.operation, actionType: token.actionType, path: p.rel, result: outcome, entry: next }, at));
      }
    }
    if (events.length > 0) {
      this.save(ledger);
      if (isNew) this.prune();
    }
    return events.map(eventForRenderer);
  }

  /** A command/build ran for this execution: its file changes, if any, are not attributed (the UI says so). */
  noteUntrackedCommand(executionId: string, cwd: string): void {
    if (!EXECUTION_ID.test(executionId)) return;
    const accountId = this.deps.getAccountId();
    if (!accountId) return;
    const real = realPathLoose(cwd);
    const isNew = !this.cache.has(executionId) && !fs.existsSync(this.ledgerFile(executionId));
    // projectRootFor starts at the given path's folder, so ask about a (hypothetical) file inside cwd.
    const ledger = this.getOrCreate(executionId, projectRootFor(path.join(real, '__cwd__')) ?? real, accountId);
    if (ledger.accountId !== accountId) return;
    ledger.untrackedCommandCount += 1;
    ledger.updatedAt = this.now();
    this.save(ledger);
    if (isNew) this.prune();
  }

  // ── reading ──────────────────────────────────────────────────────────────────────────────────
  /** The signed-in account's own ledger (full, for main-process use). */
  get(executionId: string): CodeChangeLedger | null {
    return this.owned(this.load(executionId));
  }

  /** What the renderer may see of a ledger: no events, no secret-file hashes, with totals. */
  summarize(ledger: CodeChangeLedger): CodeChangeSummary {
    const { events: _events, ...rest } = ledger;
    void _events;
    const visible = ledger.entries.filter((e) => e.status !== 'unchanged' || e.revertedAt);
    const count = (status: CodeChangeStatus) => ledger.entries.filter((e) => e.status === status).length;
    return {
      ...rest,
      entries: ledger.entries.map(entryForRenderer),
      totals: {
        files: visible.length,
        added: ledger.entries.reduce((n, e) => n + (e.added ?? 0), 0),
        removed: ledger.entries.reduce((n, e) => n + (e.removed ?? 0), 0),
        created: count('created'),
        modified: count('modified'),
        deleted: count('deleted'),
        renamed: count('renamed'),
      },
    };
  }

  /** The signed-in account's ledgers, newest first (optionally for one project root). */
  list(opts: { projectRoot?: string; limit?: number } = {}): CodeChangeSummary[] {
    if (!this.deps.getAccountId()) return [];
    let files: string[];
    try {
      files = fs.readdirSync(this.ledgersDir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const root = opts.projectRoot ? realPathLoose(opts.projectRoot) : null;
    const out: CodeChangeSummary[] = [];
    for (const f of files) {
      const ledger = this.owned(this.load(f.replace(/\.json$/, '')));
      if (!ledger || (root && ledger.projectRoot !== root)) continue;
      out.push(this.summarize(ledger));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, opts.limit ?? 50);
  }

  /** Line-by-line diff of one file's net change, computed here asynchronously (never in the renderer). */
  /** `context`: unchanged lines around each change (3 by default; a large number returns the whole file, up to the line limit). */
  async diff(executionId: string, relPath: string, context = 3): Promise<CodeChangeDiff> {
    const ledger = this.get(executionId);
    if (!ledger) return { ok: false, path: relPath, status: null, reason: 'not_found', message: 'That task’s changes aren’t available.' };
    const entry = ledger.entries.find((e) => e.path === relPath);
    if (!entry) return { ok: false, path: relPath, status: null, reason: 'not_found', message: 'That file isn’t part of this task’s changes.' };
    const before = this.readBlobText(entry.baseline);
    const after = this.readBlobText(entry.final);
    if (before === null || after === null) {
      const hiddenReason = entry.baseline.content === 'hidden' ? entry.baseline.hiddenReason : entry.final.content === 'hidden' ? entry.final.hiddenReason : undefined;
      return {
        ok: false,
        path: entry.path,
        status: entry.status,
        reason: 'hidden',
        hiddenReason,
        message:
          hiddenReason === 'secret'
            ? 'Secret file — its content is never stored or shown.'
            : hiddenReason === 'directory'
              ? 'Folder — its contents aren’t tracked.'
              : hiddenReason === 'symlink'
                ? 'Symbolic link — not followed.'
                : hiddenReason === 'too_large'
                  ? 'Too large to show a diff.'
                  : hiddenReason === 'binary'
                    ? 'Binary file — no line diff.'
                    : 'This file’s earlier content is no longer available.',
      };
    }
    const cap = (text: string) => {
      const lines = text.split('\n');
      return lines.length > MAX_DIFF_LINES ? { text: lines.slice(0, MAX_DIFF_LINES).join('\n'), truncated: true } : { text, truncated: false };
    };
    const a = cap(before);
    const b = cap(after);
    const changes = await diffLinesAsync(a.text, b.text);
    const hunks = buildHunks(changes, Math.max(0, Math.min(Math.floor(context), MAX_DIFF_LINES)));
    const lines = hunks.flatMap((h) => h.lines);
    return {
      ok: true,
      path: entry.path,
      originalPath: entry.originalPath,
      status: entry.status,
      hunks,
      added: lines.filter((l) => l.kind === 'add').length,
      removed: lines.filter((l) => l.kind === 'remove').length,
      truncated: a.truncated || b.truncated,
    };
  }

  // ── revert ───────────────────────────────────────────────────────────────────────────────────
  /**
   * Puts one file back exactly (byte for byte) as it was before this task — only if it is still
   * exactly what the task left. Anything else (the user or another task changed it since; something
   * now sits at the original path of a renamed file; a task step is running) is refused, and nothing
   * is written. The original bytes go to a temporary file first and are verified against their hash
   * before they replace anything. Paths come from the ledger, never from the caller, and are
   * re-checked against the project root, the Coding Runtime boundary and for symlinks.
   */
  async revert(executionId: string, relPath: string): Promise<CodeChangeRevertResult> {
    const ledger = this.get(executionId);
    if (!ledger) return { ok: false, path: relPath, reason: 'not_found', message: 'That task’s changes aren’t available.' };
    const index = ledger.entries.findIndex((e) => e.path === relPath);
    const entry = index >= 0 ? ledger.entries[index] : undefined;
    if (!entry) return { ok: false, path: relPath, reason: 'not_found', message: 'That file isn’t part of this task’s changes.' };
    if (entry.revertedAt) return { ok: false, path: relPath, reason: 'already_reverted', message: 'Already reverted.' };
    const available = revertAvailability(entry);
    if (!available.ok) return { ok: false, path: relPath, reason: 'not_revertible', message: available.message };
    if (this.deps.isBusy?.()) {
      return { ok: false, path: relPath, reason: 'conflict', message: 'PawOS is running a task step right now. Revert once it finishes, so nothing it writes is overwritten.' };
    }

    const root = ledger.projectRoot;
    const currentAbs = path.resolve(root, entry.path);
    const originalAbs = path.resolve(root, entry.originalPath);
    for (const target of [currentAbs, originalAbs]) {
      if (!insideRoot(root, target) || !insideRoot(root, realPathLoose(target))) {
        return { ok: false, path: relPath, reason: 'forbidden', message: 'That path is outside the project.' };
      }
      const refused = this.deps.checkWriteBoundary?.(target, root) ?? null;
      if (refused) return { ok: false, path: relPath, reason: 'forbidden', message: refused };
    }

    // What is on disk now must be exactly what the task left.
    const conflictWith = (current: FileSnapshotRef): CodeChangeRevertResult | null => {
      if (current.hiddenReason === 'symlink') return { ok: false, path: relPath, reason: 'forbidden', message: 'That path is now a symbolic link; PawOS won’t write through it.' };
      if (sameSnapshot(current, entry.final)) return null;
      return {
        ok: false,
        path: relPath,
        reason: 'conflict',
        message: current.exists
          ? entry.final.exists
            ? 'This file has changed since the task finished (your edits or another task’s). Nothing was reverted, so those changes are safe.'
            : 'A file has been created here since the task deleted it. Nothing was reverted.'
          : 'This file has been deleted or moved since the task changed it. Nothing was reverted.',
      };
    };
    const firstCheck = conflictWith(this.snapshot(currentAbs));
    if (firstCheck) return firstCheck;
    if (entry.status === 'renamed' && fs.existsSync(originalAbs)) {
      return { ok: false, path: relPath, reason: 'conflict', message: `Something now exists at the original path (${entry.originalPath}). Nothing was reverted.` };
    }

    const baselineBytes = this.readBlobBytes(entry.baseline);
    if (entry.baseline.exists && baselineBytes === null) {
      return { ok: false, path: relPath, reason: 'not_revertible', message: 'The original content isn’t available any more.' };
    }

    let restored: 'content' | 'removed' | 'moved_back';
    try {
      if (entry.status === 'created') {
        const last = conflictWith(this.snapshot(currentAbs));
        if (last) return last;
        // Never a hard delete: the created file goes to PawOS's own trash.
        await this.deps.moveToTrash(currentAbs);
        restored = 'removed';
      } else {
        const target = entry.status === 'renamed' ? originalAbs : currentAbs;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // The original bytes, verified BEFORE they replace anything.
        const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.pawos-revert`;
        fs.writeFileSync(tmp, baselineBytes ?? Buffer.alloc(0));
        const written = fs.readFileSync(tmp);
        if (entry.baseline.hash && sha256(written) !== entry.baseline.hash) {
          fs.rmSync(tmp, { force: true });
          return { ok: false, path: relPath, reason: 'failed', message: 'The original content couldn’t be reproduced exactly, so nothing was changed.' };
        }
        // Last check, immediately before replacing: still exactly what the task left?
        const last = conflictWith(this.snapshot(currentAbs));
        if (last || (entry.status === 'renamed' && fs.existsSync(originalAbs))) {
          fs.rmSync(tmp, { force: true });
          return last ?? { ok: false, path: relPath, reason: 'conflict', message: `Something now exists at the original path (${entry.originalPath}). Nothing was reverted.` };
        }
        fs.renameSync(tmp, target);
        if (entry.status === 'renamed') {
          // The renamed copy (still exactly the task's version) goes to PawOS's trash, never a hard delete.
          await this.deps.moveToTrash(currentAbs);
          restored = 'moved_back';
        } else {
          restored = 'content';
        }
      }
    } catch (error) {
      return { ok: false, path: relPath, reason: 'failed', message: `Couldn’t revert: ${(error as Error).message}` };
    }

    // Verify the result really is the original.
    const restoredAbs = entry.status === 'renamed' ? originalAbs : currentAbs;
    const after = this.snapshot(restoredAbs);
    const verified = entry.status === 'created' ? !after.exists : sameSnapshot(after, entry.baseline);
    if (!verified) return { ok: false, path: relPath, reason: 'failed', message: 'The revert ran but the file doesn’t match the original — please check it.' };

    const at = this.now();
    const next = await this.refresh({ ...entry, path: entry.status === 'renamed' ? entry.originalPath : entry.path, final: after, revertedAt: at }, ledger.seq + 1, at);
    const position = ledger.entries.findIndex((e) => e.path === relPath);
    if (position >= 0) ledger.entries[position] = next;
    const event = this.pushEvent(
      ledger,
      { operation: 'revert', actionType: 'revert', path: next.path, ...(next.path !== relPath ? { previousPath: relPath } : {}), result: 'completed', entry: next },
      at
    );
    this.save(ledger);
    return { ok: true, path: relPath, restored, event: eventForRenderer(event) };
  }
}
