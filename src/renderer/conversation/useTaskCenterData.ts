import { useCallback, useEffect, useRef, useState } from 'react';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { CodeChangeSummary } from '../../shared/actions/CodeChangeTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

/** Coalesces bursts of update events into one fetch per changed task. */
const PATCH_DELAY_MS = 250;
/** Elapsed times and health warnings are re-evaluated this often while the panel is open. */
const CLOCK_TICK_MS = 5_000;

/** Inserts or replaces one record (or removes it when it is no longer readable). */
export function patchRecords(records: ExecutionRecord[], id: string, next: ExecutionRecord | null): ExecutionRecord[] {
  const without = records.filter((record) => record.id !== id);
  return next ? [next, ...without] : without;
}

/** Inserts or replaces one change summary (or removes it). */
export function patchSummaries(summaries: ReadonlyMap<string, CodeChangeSummary>, id: string, next: CodeChangeSummary | null): ReadonlyMap<string, CodeChangeSummary> {
  const copy = new Map(summaries);
  if (next) copy.set(id, next);
  else copy.delete(id);
  return copy;
}

/**
 * The Tasks Center's data: the signed-in account's Work History records and file-change summaries.
 * Loaded in full once when shown (so it survives navigation, renderer reloads and reconnects); after
 * that, each update event patches only the one task it names — a record update re-reads that record,
 * a file change re-reads that task's summary. An update without an id (the account changed) reloads
 * everything. Duplicate or late events only cause one more idempotent fetch.
 */
export function useTaskCenterData(enabled: boolean) {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [changes, setChanges] = useState<ReadonlyMap<string, CodeChangeSummary>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fullReload = false;
    const recordIds = new Set<string>();
    const ledgerIds = new Set<string>();

    const loadAll = async () => {
      try {
        const [list, summaries] = await Promise.all([ipc.executionList(), ipc.codeChangesList({ limit: 200 })]);
        if (!alive) return;
        setRecords(list);
        setChanges(new Map(summaries.map((summary) => [summary.executionId, summary])));
        setError(null);
      } catch {
        if (alive) setError('Couldn’t load task history. It will retry when something changes.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    const flush = async () => {
      timer = undefined;
      if (fullReload) {
        fullReload = false;
        recordIds.clear();
        ledgerIds.clear();
        await loadAll();
        return;
      }
      const ids = [...recordIds];
      const ledgers = [...ledgerIds];
      recordIds.clear();
      ledgerIds.clear();
      try {
        const [nextRecords, nextLedgers] = await Promise.all([
          Promise.all(ids.map(async (id) => [id, await ipc.executionGet(id)] as const)),
          Promise.all(ledgers.map(async (id) => [id, await ipc.codeChangesGet(id)] as const)),
        ]);
        if (!alive) return;
        if (nextRecords.length > 0) setRecords((current) => nextRecords.reduce((acc, [id, record]) => patchRecords(acc, id, record), current));
        if (nextLedgers.length > 0) setChanges((current) => nextLedgers.reduce((acc, [id, summary]) => patchSummaries(acc, id, summary), current));
      } catch {
        fullReload = true;
        schedule();
      }
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(() => void flush(), PATCH_DELAY_MS);
    };

    reloadRef.current = () => {
      fullReload = true;
      schedule();
    };
    void loadAll();
    const offRecords = ipc.onExecutionUpdated((executionId) => {
      if (executionId) recordIds.add(executionId);
      else fullReload = true;
      schedule();
    });
    const offChanges = ipc.onCodeChange((event) => {
      ledgerIds.add(event.executionId);
      schedule();
    });
    const tick = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      clearInterval(tick);
      offRecords();
      offChanges();
    };
  }, [enabled]);

  const reload = useCallback(() => reloadRef.current(), []);
  return { records, changes, now, loading, error, reload };
}
