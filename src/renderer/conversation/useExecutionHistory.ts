import { useCallback, useEffect, useState } from 'react';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

/** Read-only view onto Work History (main process ExecutionMemoryStore) — nothing here writes, records only ever arrive already-finished from ExecutionSupervisor. */
export function useExecutionHistory() {
  const ipc = useIpcBridge();
  const [records, setRecords] = useState<ExecutionRecord[]>([]);

  const refresh = useCallback(() => {
    ipc.listExecutions().then(setRecords).catch(() => {});
  }, [ipc]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    ipc.onExecutionUpdated(refresh);
  }, [ipc, refresh]);

  return { records };
}
