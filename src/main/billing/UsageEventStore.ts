import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';
import { normalizedComputeToWorkPc } from '../../shared/billing/AutonomousWorkPcCommercialModel';

const FILE_NAME = 'usage-events.json';
/** Larger than CreditStore's 200-entry consumption-summary history — this is meant to be a genuine
 *  per-request transparency ledger (the Usage Details view's real data source), not just a coarse
 *  activity feed. */
const MAX_ENTRIES = 2000;

type State = {
  records: NormalizedUsageRecord[];
  recoveryRequired?: boolean;
  lastGoRefreshAt?: number;
  goCycleStartAt?: number;
  goRefreshesUsed?: number;
  weeklyCycleStartAt?: number;
  activeWindowStartAt?: number;
  /** First use on this ledger — Go's monthly file-cap cycles run from here, same day every month. */
  goFileCapAnchorAt?: number;
  /** Counted code-file changes (a file created, or an existing file edited by 30+ lines) — backs the hidden file cap. */
  fileWrites?: FileWrite[];
  /** Last successful sync with the server copy of this ledger (UsageLedgerSync.ts). */
  serverSyncedAt?: number;
};

/** One usage event as exchanged with the server copy of a ledger (sync_usage_ledger). Times are epoch ms. */
export type LedgerSyncEvent =
  | { id: string; kind: 'compute'; normalizedCompute: number; activeMs: number; at: number }
  | { id: string; kind: 'file'; fileKind: 'create' | 'edit' | null; at: number };

export type LedgerAnchors = {
  weeklyCycleStartAt: number | null;
  activeWindowStartAt: number | null;
  goCycleStartAt: number | null;
  goFileAnchorAt: number | null;
};

/** Stable id for a file-change entry (older entries predate ids): time + a short hash of the path. */
function fileWriteId(write: { path: string; at: number }): string {
  let hash = 5381;
  for (let i = 0; i < write.path.length; i++) hash = ((hash * 33) ^ write.path.charCodeAt(i)) >>> 0;
  return `fw-${write.at}-${hash.toString(36)}`;
}

/** `at` moved forward `months` calendar months, clamped to the target month's last day (Jan 31 → Feb 28/29). */
export function addMonths(at: number, months: number): number {
  const d = new Date(at);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

type FileWrite = { id?: string; path: string; at: number; kind?: 'create' | 'edit'; lines?: number };

/** Bounded history — far above the largest weekly cap, so a whole week always fits. */
const MAX_FILE_WRITES = 5000;

/** Case/separator-insensitive key, so a Windows back-slash path and its forward-slash form count as one file. */
export function normalizeFilePathKey(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function freshState(): State {
  return { records: [], recoveryRequired: false };
}

/** Parses a persisted ledger file, tolerating missing/older fields. */
function parseState(raw: string): State {
  const persisted = JSON.parse(raw) as Partial<State>;
  return {
    records: Array.isArray(persisted.records) ? persisted.records : [],
    recoveryRequired: persisted.recoveryRequired,
    lastGoRefreshAt: persisted.lastGoRefreshAt,
    goCycleStartAt: persisted.goCycleStartAt,
    goRefreshesUsed: persisted.goRefreshesUsed,
    weeklyCycleStartAt: persisted.weeklyCycleStartAt,
    activeWindowStartAt: persisted.activeWindowStartAt,
    goFileCapAnchorAt: persisted.goFileCapAnchorAt,
    serverSyncedAt: persisted.serverSyncedAt,
    fileWrites: Array.isArray(persisted.fileWrites) ? persisted.fileWrites : [],
  };
}

/** Account ids are Supabase UUIDs; anything else is reduced to a safe file-name segment. */
function accountFileKey(accountId: string): string {
  return accountId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

/** Which ledger usage is read from / written to right now. */
export type UsageScope = 'device' | 'account';

type Ledger = { file: string; state: State };

/**
 * Append-only ledger of real, normalized usage events — one entry per real model request (never per
 * turn; a turn with tool-calling continuations produces multiple entries, see UsageMeteringEngine.ts).
 * A past record is never mutated once written; the only maintenance operation is capacity eviction
 * (oldest-first), matching the append-only/auditable requirement for the canonical usage event.
 *
 * Two ledgers, chosen per call by the scope resolver (registered in ipc.ts from the effective tier):
 *  - DEVICE ledger (billing/usage-events.json) — free Paw Go usage. Shared by every free account on
 *    this PC, so signing up with another email never resets the free allowance.
 *  - ACCOUNT ledger (billing/usage/<accountId>.json) — paid tiers and PawOS Build. Belongs to the
 *    account holding the plan; another account on the same PC never sees or consumes it, and an
 *    unpaid account falls back to the device ledger.
 * Signed out / guest / no account yet → device ledger.
 */
class UsageEventStore {
  private baseDir = '';
  private device: Ledger = { file: '', state: freshState() };
  private account: (Ledger & { key: string }) | null = null;
  private scopeResolver: () => UsageScope = () => 'device';

  init(): void {
    this.baseDir = path.join(app.getPath('userData'), 'billing');
    fs.mkdirSync(path.join(this.baseDir, 'usage'), { recursive: true });
    this.device = this.loadLedger(path.join(this.baseDir, FILE_NAME));
  }

  private loadLedger(file: string): Ledger {
    try {
      return { file, state: parseState(fs.readFileSync(file, 'utf-8')) };
    } catch {
      const ledger = { file, state: freshState() };
      fs.writeFileSync(file, JSON.stringify(ledger.state, null, 2), 'utf-8');
      return ledger;
    }
  }

  /** Registers how to pick the ledger (effective tier → 'device' for free Go, 'account' otherwise). */
  setScopeResolver(resolver: () => UsageScope): void {
    this.scopeResolver = resolver;
  }

  /** Loads the signed-in account's own ledger (null = signed out). */
  setAccount(accountId: string | null): void {
    if (!accountId) {
      this.account = null;
      return;
    }
    const key = accountFileKey(accountId);
    if (this.account?.key === key) return;
    if (!this.baseDir) {
      // Not initialised (unit tests): keep an in-memory account ledger only.
      this.account = { key, file: '', state: freshState() };
      return;
    }
    this.account = { key, ...this.loadLedger(path.join(this.baseDir, 'usage', `${key}.json`)) };
  }

  /** The scope in effect right now — 'account' only when an account is loaded and the resolver asks for it. */
  getScope(): UsageScope {
    return this.account && this.scopeResolver() === 'account' ? 'account' : 'device';
  }

  private current(): Ledger {
    return this.getScope() === 'account' && this.account ? this.account : this.device;
  }

  private get state(): State {
    return this.current().state;
  }

  private set state(next: State) {
    this.current().state = next;
  }

  private save(): void {
    const ledger = this.current();
    // Before init() there is no file to persist to (e.g. unit tests exercising the gate directly).
    if (!ledger.file) return;
    fs.writeFileSync(ledger.file, JSON.stringify(ledger.state, null, 2), 'utf-8');
  }

  /**
   * Records one counted code-file change in the active ledger (device for Go, account for paid).
   * Every call is one unit toward the weekly cap — a second qualifying edit to the same file counts again.
   */
  /** Returns the write's stable id — also the idempotency key when an over-cap file is charged. */
  recordFileWrite(filePath: string, detail: { kind: 'create' | 'edit'; lines: number }, at = Date.now()): string {
    const writes = (this.state.fileWrites ??= []);
    const key = normalizeFilePathKey(filePath);
    const id = fileWriteId({ path: key, at });
    writes.push({ id, path: key, at, kind: detail.kind, lines: detail.lines });
    if (writes.length > MAX_FILE_WRITES) writes.splice(0, writes.length - MAX_FILE_WRITES);
    this.save();
    return id;
  }

  /** Counted code-file changes since `cutoff` in the active ledger. */
  countFileChangesSince(cutoff: number): number {
    return (this.state.fileWrites ?? []).filter((w) => w.at >= cutoff).length;
  }

  setLastGoRefreshAt(timestamp: number): void {
    this.state.lastGoRefreshAt = timestamp;
    this.save();
  }

  getLastGoRefreshAt(): number | undefined {
    return this.state.lastGoRefreshAt;
  }

  getWeeklyCycleStartAt(now = Date.now()): number {
    if (!this.state.weeklyCycleStartAt) {
      this.state.weeklyCycleStartAt = now;
      this.save();
    }
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    let changed = false;
    while (now >= this.state.weeklyCycleStartAt + WEEK_MS) {
      this.state.weeklyCycleStartAt += WEEK_MS;
      changed = true;
    }
    if (changed) this.save();
    return this.state.weeklyCycleStartAt;
  }

  getActiveWindowStartAt(now = Date.now()): number {
    if (!this.state.activeWindowStartAt) {
      this.state.activeWindowStartAt = now;
      this.save();
    }
    const WINDOW_MS = 5 * 60 * 60 * 1000;
    let changed = false;
    while (now >= this.state.activeWindowStartAt + WINDOW_MS) {
      this.state.activeWindowStartAt += WINDOW_MS;
      changed = true;
    }
    if (changed) this.save();
    return this.state.activeWindowStartAt;
  }

  advanceActiveWindow(now = Date.now()): void {
    this.state.activeWindowStartAt = now;
    this.save();
  }

  /**
   * Start of Go's current monthly file-cap cycle. Cycles are whole calendar months counted from the
   * first-use anchor, so the cap resets on the same day each month (clamped for short months). A
   * clock set back before the anchor re-anchors at `now`.
   */
  getGoFileCapMonthStartAt(now = Date.now()): number {
    let anchor = this.state.goFileCapAnchorAt;
    if (!anchor || now < anchor) {
      anchor = now;
      this.state.goFileCapAnchorAt = anchor;
      this.save();
    }
    const a = new Date(anchor);
    const n = new Date(now);
    let months = (n.getFullYear() - a.getFullYear()) * 12 + (n.getMonth() - a.getMonth());
    if (addMonths(anchor, months) > now) months -= 1;
    return addMonths(anchor, Math.max(0, months));
  }

  getGoCycleStatus(now = Date.now()): { cycleStartAt: number; refreshesUsed: number } {
    let start = this.state.goCycleStartAt;
    const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;
    
    if (!start || now >= start + CYCLE_MS) {
      start = now;
      this.state.goCycleStartAt = start;
      this.state.goRefreshesUsed = 0;
      this.save();
    }
    
    return {
      cycleStartAt: start,
      refreshesUsed: this.state.goRefreshesUsed ?? 0
    };
  }

  getGoRefreshesRemaining(now = Date.now()): number {
    const status = this.getGoCycleStatus(now);
    return Math.max(0, 3 - status.refreshesUsed);
  }

  consumeGoRefresh(now = Date.now()): boolean {
    const status = this.getGoCycleStatus(now);
    if (status.refreshesUsed >= 3) return false;
    
    this.state.goRefreshesUsed = status.refreshesUsed + 1;
    this.state.lastGoRefreshAt = now;
    this.save();
    return true;
  }

  /** Appends one already-normalized record — normalization itself happens in UsageMeteringEngine.ts,
   *  never here; this store only persists what it's given. */
  append(record: NormalizedUsageRecord): void {
    console.log('[USAGE_EVENT_APPEND] requestId:', record.requestId, 'runId:', record.runId, 'normalizedCompute:', record.normalizedCompute);
    this.state.records.push(record);
    if (this.state.records.length > MAX_ENTRIES) {
      this.state.records = this.state.records.slice(-MAX_ENTRIES);
    }
    this.save();
  }

  // ── Server copy of the ledgers (UsageLedgerSync.ts) ─────────────────────────────────────────────

  /** The device ledger, or the loaded account ledger (null when no account is loaded). */
  private ledgerFor(scope: UsageScope): Ledger | null {
    return scope === 'device' ? this.device : this.account;
  }

  private saveLedger(ledger: Ledger): void {
    if (!ledger.file) return;
    fs.writeFileSync(ledger.file, JSON.stringify(ledger.state, null, 2), 'utf-8');
  }

  /** Whether an account ledger is loaded right now. */
  hasAccountLedger(): boolean {
    return this.account !== null;
  }

  /**
   * What to upload for `scope`: its cycle anchors and every usage event that counts toward limits
   * (never Fable, background or autonomous-run usage) since `sinceMs`, oldest first.
   */
  exportForServer(scope: UsageScope, sinceMs: number): { anchors: LedgerAnchors; events: LedgerSyncEvent[]; lastSyncedAt: number | null } | null {
    const ledger = this.ledgerFor(scope);
    if (!ledger) return null;
    const s = ledger.state;
    const compute: LedgerSyncEvent[] = s.records
      .filter((r) => r.timestamp >= sinceMs && !r.fable && r.requestType !== 'backgroundTask' && !r.runId && r.usageEventId)
      .map((r) => ({ id: r.usageEventId, kind: 'compute' as const, normalizedCompute: r.normalizedCompute ?? 0, activeMs: r.activeDurationMs ?? 0, at: r.timestamp }));
    const files: LedgerSyncEvent[] = (s.fileWrites ?? [])
      .filter((w) => w.at >= sinceMs)
      .map((w) => ({ id: w.id ?? fileWriteId(w), kind: 'file' as const, fileKind: w.kind ?? null, at: w.at }));
    return {
      anchors: {
        weeklyCycleStartAt: s.weeklyCycleStartAt ?? null,
        activeWindowStartAt: s.activeWindowStartAt ?? null,
        goCycleStartAt: s.goCycleStartAt ?? null,
        goFileAnchorAt: s.goFileCapAnchorAt ?? null,
      },
      events: [...compute, ...files].sort((a, b) => a.at - b.at),
      lastSyncedAt: s.serverSyncedAt ?? null,
    };
  }

  /**
   * Merges the server copy into the local ledger: adds any event missing locally (e.g. after the
   * local file was deleted) and adopts the server's cycle anchors, which can't be rewound. Local
   * events are never removed. Returns how many events were added.
   */
  mergeFromServer(scope: UsageScope, server: { anchors: Partial<LedgerAnchors>; events: LedgerSyncEvent[] }, syncedAt = Date.now()): number {
    const ledger = this.ledgerFor(scope);
    if (!ledger) return 0;
    const s = ledger.state;
    const haveCompute = new Set(s.records.map((r) => r.usageEventId));
    const fileWrites = (s.fileWrites ??= []);
    const haveFiles = new Set(fileWrites.map((w) => w.id ?? fileWriteId(w)));
    let added = 0;
    for (const e of server.events ?? []) {
      if (!e?.id || typeof e.at !== 'number') continue;
      if (e.kind === 'compute' && !haveCompute.has(e.id)) {
        s.records.push({
          usageEventId: e.id,
          requestId: null,
          sessionId: null,
          runId: null,
          provider: 'server',
          model: 'restored',
          requestType: 'conversationTurn',
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          totalTokens: null,
          thoughtsTokens: null,
          normalizedCompute: Number(e.normalizedCompute) || 0,
          activeDurationMs: Number(e.activeMs) || 0,
          timestamp: e.at,
        });
        haveCompute.add(e.id);
        added++;
      } else if (e.kind === 'file' && !haveFiles.has(e.id)) {
        // The path isn't sent to the server; a restored entry only needs to count.
        fileWrites.push({ id: e.id, path: `restored:${e.id}`, at: e.at, kind: e.fileKind ?? undefined });
        haveFiles.add(e.id);
        added++;
      }
    }
    if (added > 0) {
      s.records.sort((a, b) => a.timestamp - b.timestamp);
      if (s.records.length > MAX_ENTRIES) s.records = s.records.slice(-MAX_ENTRIES);
      fileWrites.sort((a, b) => a.at - b.at);
      if (fileWrites.length > MAX_FILE_WRITES) fileWrites.splice(0, fileWrites.length - MAX_FILE_WRITES);
    }
    const a = server.anchors ?? {};
    if (typeof a.weeklyCycleStartAt === 'number') s.weeklyCycleStartAt = a.weeklyCycleStartAt;
    if (typeof a.activeWindowStartAt === 'number') s.activeWindowStartAt = a.activeWindowStartAt;
    if (typeof a.goCycleStartAt === 'number' && a.goCycleStartAt !== s.goCycleStartAt) {
      s.goCycleStartAt = a.goCycleStartAt;
    }
    if (typeof a.goFileAnchorAt === 'number') s.goFileCapAnchorAt = a.goFileAnchorAt;
    s.serverSyncedAt = syncedAt;
    this.saveLedger(ledger);
    return added;
  }

  /** Most-recent-first, optionally capped — the real data source for a future Usage Details view. */
  list(limit?: number): NormalizedUsageRecord[] {
    const ordered = [...this.state.records].reverse();
    return typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
  }

  /** The idempotency lookup UsageMeteringEngine.recordUsageEvent() uses before ever appending a new
   *  record — a real match here means this exact real Gemini request (by PawOS's own per-request
   *  identity, see ProviderUsageMetadata's doc comment) was already durably recorded, so the caller
   *  should reuse this record rather than create a second one. Never matches on a null requestId,
   *  since null carries no real identity to deduplicate against. Bounded by the same MAX_ENTRIES the
   *  ledger already caps at — a request old enough to have been evicted is treated as new, an
   *  accepted, disclosed edge of the existing eviction policy, not a new gap this method introduces. */
  findByRequestId(requestId: string): NormalizedUsageRecord | undefined {
    return this.state.records.find((r) => r.requestId === requestId);
  }

  /** Calculate actual PC for a run. CRITICAL SAFETY: Returns 0 only for legitimate zero-usage runs.
   *  If checkpoint corruption is detected (recoveryRequired flag set), throws an error instead.
   *  This prevents silent undercharging when usage events are lost due to process crash or IPC failure.
   *
   *  Usage:
   *    Normal 0-usage run → returns 0 (safe)
   *    Corrupted checkpoint → throws error (requires recovery)
   *  */
  calculateActualPcForRun(runId: string): number {
    // CRITICAL SAFETY CHECK: Do not return zero usage if checkpoint integrity is uncertain
    if (this.state.recoveryRequired === true) {
      throw new Error(
        `[RECOVERY_REQUIRED] Usage data integrity compromised for run ${runId}. ` +
        `Cannot settle with potentially incomplete records. Manual checkpoint recovery required.`
      );
    }

    const records = this.state.records.filter((r) => r.runId === runId);
    const totalNormalizedCompute = records.reduce((sum, r) => sum + (r.normalizedCompute ?? 0), 0);

    // CRITICAL: Convert from internal normalized compute to customer Work PC
    // Formula: normalizedCompute / 1000 = provider cost USD
    // Then: provider cost USD → 70% margin → customer charge → Work PC
    const actualWorkPc = normalizedComputeToWorkPc(totalNormalizedCompute);

    console.log(
      '[USAGE_ACTUAL_PC_CALCULATED]',
      {
        runId,
        totalNormalizedCompute: Math.round(totalNormalizedCompute * 100) / 100,
        actualWorkPc: Math.round(actualWorkPc * 100) / 100,
        recordCount: records.length,
        recoveryRequired: this.state.recoveryRequired,
        note: 'Converted from normalized compute to customer Work PC via 70% margin'
      }
    );

    return Math.round(actualWorkPc);
  }

  /** Check if checkpoint recovery is required. Used by settlement handlers to block
   *  settlement when data integrity is uncertain. */
  isRecoveryRequired(): boolean {
    return this.state.recoveryRequired === true;
  }

  /** Mark checkpoint as requiring recovery. Called when checkpoint integrity is
   *  compromised (e.g., process crash during write, IPC failure, filesystem errors).
   *  Settlement will be blocked until recovery completes. */
  setRecoveryRequired(reason: string): void {
    console.log('[USAGE_RECOVERY_FLAG_SET]', { reason });
    this.state.recoveryRequired = true;
    this.save();
  }

  /** Clear recovery flag after successful recovery/reconciliation. Called only after
   *  manual review confirms checkpoint integrity. */
  clearRecoveryFlag(): void {
    console.log('[USAGE_RECOVERY_FLAG_CLEARED]');
    this.state.recoveryRequired = false;
    this.save();
  }
}

export const usageEventStore = new UsageEventStore();

