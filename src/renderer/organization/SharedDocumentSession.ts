import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import { workspaceContentService } from './WorkspaceContentService';

const SAVE_DEBOUNCE_MS = 1500;
const STATE_REQUEST_TIMEOUT_MS = 500;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Phase 4 — real-time co-editing for a single workspace_documents row,
 * using Yjs (CRDT) synced over a Supabase Realtime broadcast channel —
 * the roadmap's own description of "Shared editing" verbatim. Reuses the
 * document's existing `content` column and RLS/audit trigger from Phase 1
 * (WorkspaceContentService.updateDocumentContent) — no new table.
 *
 * State-sync note: rather than every joining client re-seeding its Y.Text
 * from the last Postgres snapshot independently (which would silently
 * double the content once two clients' independent inserts merge — Yjs
 * dedupes by operation identity, not by text equality), a joining client
 * first asks the channel "does anyone already have live state?" and only
 * falls back to seeding from Postgres if nobody answers within a short
 * window. This is a minimal hand-rolled version of the state-vector
 * handshake most Yjs providers implement, scoped to what this feature
 * actually needs (no full awareness protocol, no cursor-in-doc metadata).
 *
 * Scope decision (disclosed): persisting edits still goes through the
 * exact same RLS as Phase 1 — creator or documents.manage. Real-time sync
 * makes editing live for whoever was already authorized to edit; it does
 * not broaden who can persist a change.
 */
export class SharedDocumentSession {
  private doc = new Y.Doc();
  private ytext = this.doc.getText('content');
  private channel: RealtimeChannel | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private documentId = '';
  private changeListeners = new Set<(text: string) => void>();

  async open(documentId: string, initialContent: string | null): Promise<void> {
    this.documentId = documentId;
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`workspace-document:${documentId}`, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'request-state' }, () => {
      if (this.ytext.length === 0) return; // nothing real to offer yet
      channel.send({ type: 'broadcast', event: 'state', payload: { update: uint8ToBase64(Y.encodeStateAsUpdate(this.doc)) } });
    });

    let resolveStateWait: (() => void) | null = null;
    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      Y.applyUpdate(this.doc, base64ToUint8((payload as { update: string }).update), 'remote');
      resolveStateWait?.();
    });

    channel.on('broadcast', { event: 'update' }, ({ payload }) => {
      Y.applyUpdate(this.doc, base64ToUint8((payload as { update: string }).update), 'remote');
    });

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // don't echo back what we just applied from a peer
      channel.send({ type: 'broadcast', event: 'update', payload: { update: uint8ToBase64(update) } });
    });

    this.ytext.observe(() => {
      const text = this.ytext.toString();
      for (const listener of this.changeListeners) listener(text);
      this.scheduleSave(text);
    });

    await new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    this.channel = channel;

    const gotState = await new Promise<boolean>((resolve) => {
      resolveStateWait = () => resolve(true);
      channel.send({ type: 'broadcast', event: 'request-state', payload: {} });
      setTimeout(() => resolve(false), STATE_REQUEST_TIMEOUT_MS);
    });

    if (!gotState && this.ytext.length === 0 && initialContent) {
      this.ytext.insert(0, initialContent);
    }
  }

  getText(): string {
    return this.ytext.toString();
  }

  onChange(listener: (text: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Diff against current CRDT text and apply as minimal insert/delete ops, so concurrent edits from others merge sensibly instead of one full-text replace clobbering another's in-flight change. */
  setLocalText(nextValue: string): void {
    const current = this.ytext.toString();
    if (current === nextValue) return;
    let start = 0;
    while (start < current.length && start < nextValue.length && current[start] === nextValue[start]) start++;
    let endCurrent = current.length;
    let endNext = nextValue.length;
    while (endCurrent > start && endNext > start && current[endCurrent - 1] === nextValue[endNext - 1]) {
      endCurrent--;
      endNext--;
    }
    this.doc.transact(() => {
      if (endCurrent > start) this.ytext.delete(start, endCurrent - start);
      if (endNext > start) this.ytext.insert(start, nextValue.slice(start, endNext));
    });
  }

  private scheduleSave(text: string): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      workspaceContentService.updateDocumentContent(this.documentId, text).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }

  async close(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      await workspaceContentService.updateDocumentContent(this.documentId, this.getText()).catch(() => {});
    }
    await this.channel?.unsubscribe();
    this.channel = null;
    this.changeListeners.clear();
  }
}
