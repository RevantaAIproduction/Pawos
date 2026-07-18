import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type {
  ConversationSession,
  ConversationSessionSummary,
  ConversationSessionTurn,
  SessionContinuationHint,
} from '../../shared/conversation/ConversationSessionTypes';

const FILE_NAME = 'conversation-sessions.json';

/**
 * Fallback for when the caller has no opinion (hint.type === 'auto') — a
 * session stays "continuable" while its last turn is within this window;
 * past it, the next turn starts a fresh session instead. The topic-aware
 * decision ("Continue yesterday's React lesson" vs. "Let's talk about my
 * startup") happens upstream in the renderer, which has access to the
 * reasoning provider (see SessionClassifier.ts) — this store only executes
 * whatever hint it's given, and falls back to this time-gap heuristic only
 * when no semantic decision was made at all.
 */
const SESSION_CONTINUATION_WINDOW_MS = 30 * 60 * 1000;

function titleFromTranscript(transcript: string): string {
  const trimmed = transcript.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New conversation';
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

/**
 * Electron's memory of every conversation — the one main-process store in
 * this app that's genuinely rooted at app.getPath('userData') and genuinely
 * read-only from the renderer's perspective (it can list/search/pin/
 * archive/export/delete, never edit a turn). Turns arrive already-finished
 * from ConversationRuntime via IPC; this class only decides which session
 * they land in and persists the result.
 */
class ConversationSessionStore {
  private filePath = '';
  private sessions: ConversationSession[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    } catch {
      this.sessions = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ sessions: this.sessions }, null, 2), 'utf-8');
  }

  private toSummary(session: ConversationSession): ConversationSessionSummary {
    const first = session.turns[0];
    const last = session.turns[session.turns.length - 1];
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      pinned: session.pinned,
      archived: session.archived,
      turnCount: session.turns.length,
      durationMs: first && last ? (last.endedAt ?? last.startedAt) - first.startedAt : 0,
      lastMessage: last?.assistantResponse || last?.transcript || '',
    };
  }

  list(): ConversationSessionSummary[] {
    return [...this.sessions]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map((s) => this.toSummary(s));
  }

  get(id: string): ConversationSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  search(query: string): ConversationSessionSummary[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return this.list().filter((summary) => {
      if (summary.title.toLowerCase().includes(q) || summary.lastMessage.toLowerCase().includes(q)) return true;
      const full = this.get(summary.id);
      return Boolean(
        full?.turns.some((t) => t.transcript.toLowerCase().includes(q) || t.assistantResponse.toLowerCase().includes(q))
      );
    });
  }

  private findContinuableSession(): ConversationSession | undefined {
    const candidate = [...this.sessions].filter((s) => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!candidate) return undefined;
    return Date.now() - candidate.updatedAt <= SESSION_CONTINUATION_WINDOW_MS ? candidate : undefined;
  }

  private extractFilesAndApps(turn: ConversationSessionTurn): { files: string[]; apps: string[] } {
    const files: string[] = [];
    const apps: string[] = [];
    for (const action of turn.actionsExecuted) {
      if (!action.ok) continue;
      if (action.type === 'createFolder') files.push(action.label);
      else if (action.type === 'openApp') apps.push(action.label);
    }
    return { files, apps };
  }

  /**
   * Appends a finished turn per `hint`: 'continue' files it under that exact
   * session (if it still exists), 'new' always starts fresh, and 'auto'
   * (no decision made upstream) falls back to the still-warm-session
   * heuristic. Voice and text turns call this identically — the session
   * doesn't know or care which input mode produced the turn.
   */
  appendTurn(turn: ConversationSessionTurn, hint: SessionContinuationHint = { type: 'auto' }): ConversationSession {
    let session: ConversationSession | undefined;
    if (hint.type === 'continue') session = this.get(hint.sessionId);
    else if (hint.type === 'auto') session = this.findContinuableSession();
    // hint.type === 'new' (or a 'continue' whose session vanished) leaves
    // session undefined, so a fresh one gets created below.

    const { files, apps } = this.extractFilesAndApps(turn);

    if (!session) {
      session = {
        id: turn.id,
        title: titleFromTranscript(turn.transcript),
        createdAt: turn.startedAt,
        updatedAt: turn.endedAt ?? turn.startedAt,
        pinned: false,
        archived: false,
        turns: [turn],
        filesCreated: files,
        applicationsOpened: apps,
      };
      this.sessions.push(session);
    } else {
      session.turns.push(turn);
      session.updatedAt = turn.endedAt ?? turn.startedAt;
      for (const f of files) if (!session.filesCreated.includes(f)) session.filesCreated.push(f);
      for (const a of apps) if (!session.applicationsOpened.includes(a)) session.applicationsOpened.push(a);
    }

    this.save();
    return session;
  }

  rename(id: string, title: string): ConversationSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.title = title.trim() || session.title;
    this.save();
    return session;
  }

  setPinned(id: string, pinned: boolean): ConversationSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.pinned = pinned;
    this.save();
    return session;
  }

  setArchived(id: string, archived: boolean): ConversationSession | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    session.archived = archived;
    this.save();
    return session;
  }

  delete(id: string): boolean {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.id !== id);
    const deleted = this.sessions.length !== before;
    if (deleted) this.save();
    return deleted;
  }

  export(id: string): string | undefined {
    const session = this.get(id);
    return session ? JSON.stringify(session, null, 2) : undefined;
  }
}

export const conversationSessionStore = new ConversationSessionStore();
