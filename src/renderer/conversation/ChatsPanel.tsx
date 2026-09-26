import React, { useCallback, useEffect, useState } from 'react';
import styles from './chatsPanel.module.css';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { chatTitle, groupChats } from './chatsPanelModel';
import type { ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

// The bridge's "sessions changed" event has no unsubscribe — subscribe once, fan out to open panels.
const refreshListeners = new Set<() => void>();
let subscribed = false;
function onChatsChanged(listener: () => void): () => void {
  if (!subscribed) {
    subscribed = true;
    ipc.onSessionsUpdated(() => refreshListeners.forEach((l) => l()));
  }
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

interface ChatsPanelProps {
  activeChatId: string | null;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
}

/** Past chats — search, open, pin, delete; "New chat" starts a fresh one. */
export function ChatsPanel({ activeChatId, onOpenChat, onNewChat }: ChatsPanelProps) {
  const [chats, setChats] = useState<ConversationSessionSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = query.trim();
      setChats(q ? await ipc.sessionsSearch(q) : await ipc.sessionsList());
    } catch {
      setChats([]);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);
  useEffect(() => onChatsChanged(() => void load()), [load]);

  const groups = chats ? groupChats(chats) : [];

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          spellCheck={false}
        />
        <button type="button" className={styles.iconBtn} onClick={onNewChat} title="New chat" aria-label="New chat">
          <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {chats === null && <div className={styles.muted}>Loading…</div>}
      {chats !== null && groups.length === 0 && <div className={styles.muted}>{query.trim() ? 'No chats match.' : 'No chats yet.'}</div>}

      {groups.map((group) => (
        <section key={group.label} className={styles.group}>
          <div className={styles.groupLabel}>{group.label}</div>
          {group.chats.map((chat) => (
            <div key={chat.id} className={`${styles.row} ${chat.id === activeChatId ? styles.active : ''}`}>
              <button type="button" className={styles.open} onClick={() => onOpenChat(chat.id)} title={chatTitle(chat)} aria-current={chat.id === activeChatId ? 'true' : undefined}>
                {chatTitle(chat)}
              </button>
              {confirmDeleteId === chat.id ? (
                <>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.danger}`}
                    title="Delete chat"
                    aria-label="Confirm delete"
                    onClick={async () => {
                      setConfirmDeleteId(null);
                      await ipc.sessionsDelete(chat.id).catch(() => false);
                      if (chat.id === activeChatId) onNewChat();
                      void load();
                    }}
                  >
                    <svg {...iconProps}><path d="M5 12l5 5L20 7" /></svg>
                  </button>
                  <button type="button" className={styles.iconBtn} title="Keep" aria-label="Cancel delete" onClick={() => setConfirmDeleteId(null)}>
                    <svg {...iconProps}><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </>
              ) : (
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${chat.pinned ? styles.pinned : ''}`}
                    title={chat.pinned ? 'Unpin' : 'Pin'}
                    aria-label={chat.pinned ? 'Unpin chat' : 'Pin chat'}
                    onClick={async () => {
                      await ipc.sessionsSetPinned(chat.id, !chat.pinned).catch(() => undefined);
                      void load();
                    }}
                  >
                    <svg {...iconProps}><path d="M9 4h6l-1 6 4 4H6l4-4zM12 14v6" /></svg>
                  </button>
                  <button type="button" className={styles.iconBtn} title="Delete" aria-label="Delete chat" onClick={() => setConfirmDeleteId(chat.id)}>
                    <svg {...iconProps}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                </span>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
