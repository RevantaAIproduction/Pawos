import React, { useEffect, useRef, useState } from 'react';
import { SharedDocumentSession } from '../../../organization/SharedDocumentSession';

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 140,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: 10,
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
};

/**
 * Phase 4 — live collaborative editor for a single note-type
 * workspace_documents row. Backed by SharedDocumentSession (Yjs CRDT over
 * a Supabase Realtime broadcast channel); every keystroke here is
 * reflected to any other org member with this same document open, and
 * debounce-persisted back to the document's existing `content` column
 * (same RLS/audit as Phase 1 — see WorkspaceContentService).
 */
export function SharedDocumentEditor({ documentId, initialContent }: { documentId: string; initialContent: string | null }) {
  const [value, setValue] = useState(initialContent ?? '');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const sessionRef = useRef<SharedDocumentSession | null>(null);
  const saveIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const session = new SharedDocumentSession();
    sessionRef.current = session;
    session.open(documentId, initialContent).then(() => {
      if (cancelled) return;
      setValue(session.getText());
      setReady(true);
    });
    const unsubscribe = session.onChange((text) => {
      setValue(text);
      setSaving(true);
      if (saveIndicatorTimer.current) clearTimeout(saveIndicatorTimer.current);
      saveIndicatorTimer.current = setTimeout(() => setSaving(false), 1800);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        style={textareaStyle}
        value={value}
        disabled={!ready}
        placeholder={ready ? 'Start typing — everyone with this doc open sees it live.' : 'Connecting…'}
        onChange={(e) => {
          setValue(e.target.value);
          sessionRef.current?.setLocalText(e.target.value);
        }}
      />
      <div style={{ fontSize: 11, color: '#96969e', marginTop: 4 }}>{saving ? 'Saving…' : ready ? 'Live — synced' : 'Connecting…'}</div>
    </div>
  );
}
