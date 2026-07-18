import { useCallback, useEffect, useRef, useState } from 'react';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import type { ConversationSession, ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

/**
 * Read/organize-only view onto Electron's session history (main process).
 * Never edits a turn's recorded content — only list/search/pin/archive/
 * rename/export/delete, per the "conversation history is read-only" rule.
 */
export function useConversationSessions() {
  const ipc = useIpcBridge();
  const [sessions, setSessions] = useState<ConversationSessionSummary[]>([]);
  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;

  const refresh = useCallback(() => {
    const load = queryRef.current.trim() ? ipc.searchSessions(queryRef.current) : ipc.listSessions();
    load.then(setSessions).catch(() => {});
  }, [ipc]);

  useEffect(() => {
    refresh();
  }, [refresh, query]);

  useEffect(() => {
    ipc.onSessionsUpdated(refresh);
  }, [ipc, refresh]);

  const getSession = useCallback((id: string): Promise<ConversationSession | undefined> => ipc.getSession(id), [ipc]);
  const rename = useCallback((id: string, title: string) => ipc.renameSession(id, title).then(refresh), [ipc, refresh]);
  const setPinned = useCallback((id: string, pinned: boolean) => ipc.setSessionPinned(id, pinned).then(refresh), [ipc, refresh]);
  const setArchived = useCallback(
    (id: string, archived: boolean) => ipc.setSessionArchived(id, archived).then(refresh),
    [ipc, refresh]
  );
  const remove = useCallback((id: string) => ipc.deleteSession(id).then(refresh), [ipc, refresh]);
  const exportSession = useCallback((id: string) => ipc.exportSession(id), [ipc]);

  return { sessions, query, setQuery, getSession, rename, setPinned, setArchived, remove, exportSession };
}
