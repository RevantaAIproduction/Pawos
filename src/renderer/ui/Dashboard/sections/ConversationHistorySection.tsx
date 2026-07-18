import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useConversationSessions } from '../../../conversation/useConversationSessions';
import type { ConversationSession } from '../../../../shared/conversation/ConversationSessionTypes';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Electron's memory of every conversation — view/search/pin/archive/export/
 * delete/rename only. Nothing here edits a turn's recorded transcript or
 * response; that would break the "conversation history is read-only" rule.
 */
export function ConversationHistorySection() {
  const { sessions, query, setQuery, getSession, rename, setPinned, setArchived, remove, exportSession } =
    useConversationSessions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationSession | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const visible = sessions.filter((s) => s.archived === showArchived);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    getSession(activeId).then((session) => {
      if (!cancelled) setDetail(session ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, getSession]);

  useEffect(() => {
    if (activeId && !sessions.some((s) => s.id === activeId)) setActiveId(null);
  }, [sessions, activeId]);

  if (sessions.length === 0 && !query.trim()) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No conversations yet</h3>
        <p className={styles.emptyBody}>
          Every conversation with Paw automatically becomes a session here — this page only stores and organizes
          history, it never changes what was said.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.managerToolbar} style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          style={{
            flex: 1,
            maxWidth: 320,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.02)',
            color: '#f5f5f7',
            padding: '9px 12px',
            fontSize: 13,
          }}
        />
        <button type="button" className={styles.chip} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Show active' : 'Show archived'}
        </button>
      </div>

      <div className={styles.mailPreview}>
        <div className={styles.mailPreviewList}>
          {visible.length === 0 && (
            <p className={styles.cardBody} style={{ padding: 12 }}>
              No matching conversations.
            </p>
          )}
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.mailPreviewItem} ${activeId === s.id ? styles.mailPreviewItemActive : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <div>
                {s.pinned ? '📌 ' : ''}
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: '#6c6c74', marginTop: 2 }}>
                {formatDate(s.updatedAt)} · {s.turnCount} turn{s.turnCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>

        <div className={styles.mailPreviewFrame} style={{ padding: detail ? 20 : 0, overflowY: 'auto' }}>
          {!detail && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <p className={styles.cardBody}>Select a conversation to view its transcript.</p>
            </div>
          )}
          {detail && (
            <>
              {renamingId === detail.id ? (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => {
                    rename(detail.id, draftTitle);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      rename(detail.id, draftTitle);
                      setRenamingId(null);
                    }
                  }}
                  className={styles.chip}
                  style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}
                />
              ) : (
                <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{detail.title}</h2>
              )}

              <p className={styles.cardBody} style={{ marginBottom: 14 }}>
                {formatDate(detail.createdAt)} → {formatDate(detail.updatedAt)} ·{' '}
                {formatDuration(detail.turns.reduce((sum, t) => sum + ((t.endedAt ?? t.startedAt) - t.startedAt), 0))} ·{' '}
                {detail.turns.length} turn{detail.turns.length === 1 ? '' : 's'}
              </p>

              <div className={styles.quickActions} style={{ marginBottom: 18 }}>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    setRenamingId(detail.id);
                    setDraftTitle(detail.title);
                  }}
                >
                  Rename
                </button>
                <button type="button" className={styles.chip} onClick={() => setPinned(detail.id, !detail.pinned)}>
                  {detail.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" className={styles.chip} onClick={() => setArchived(detail.id, !detail.archived)}>
                  {detail.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    exportSession(detail.id).then((json) => {
                      if (json) download(`${detail.title.replace(/\s+/g, '-').toLowerCase()}.json`, json);
                    });
                  }}
                >
                  Export
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    if (window.confirm(`Delete "${detail.title}"? This cannot be undone.`)) {
                      remove(detail.id);
                      setActiveId(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>

              {(detail.filesCreated.length > 0 || detail.applicationsOpened.length > 0) && (
                <p className={styles.cardBody} style={{ marginBottom: 18 }}>
                  {detail.applicationsOpened.length > 0 && <>Apps opened: {detail.applicationsOpened.join(', ')}. </>}
                  {detail.filesCreated.length > 0 && <>Created: {detail.filesCreated.join(', ')}.</>}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detail.turns.map((turn) => (
                  <div key={turn.id}>
                    <div
                      style={{
                        borderRadius: 14,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.08)',
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em',
                          color: 'rgba(255,255,255,0.52)',
                          marginBottom: 4,
                        }}
                      >
                        You
                      </div>
                      {turn.transcript}
                    </div>
                    {turn.assistantResponse && (
                      <div style={{ borderRadius: 14, padding: '10px 12px', background: 'rgba(104,168,255,0.16)' }}>
                        <div
                          style={{
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            color: 'rgba(255,255,255,0.52)',
                            marginBottom: 4,
                          }}
                        >
                          Paw
                        </div>
                        {turn.assistantResponse}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
