import * as fs from 'fs';
import * as path from 'path';
import { accessTokenUserId, callRpcAsUser, getServerAccessToken } from '../auth/ServerSessionToken';
import type {
  ChatSurface,
  ConversationSession,
  ConversationSessionSummary,
  ConversationSessionTurn,
} from '../../shared/conversation/ConversationSessionTypes';

/**
 * Keeps this desktop app's chats in the PawOS account, so the same chats show in PawOS Desktop, on
 * PawOS Web and on a phone (supabase/migrations/20261004050000_account_chats.sql).
 *
 * Up: each finished turn is queued in a small outbox file and sent with
 * account_chat_sync_desktop_turn() as the signed-in user. The outbox survives restarts and offline
 * periods; a turn is sent once (the server ignores a repeat). Only the conversation text is sent —
 * what the user said and what Paw answered. Tool output, local file contents, screenshots and
 * evidence stay on this computer.
 *
 * Down: the chat list also shows the account's chats that aren't on this computer (started on Web,
 * on a phone, or on another computer), read with get_my_account_chats / get_my_account_chat.
 *
 * Ownership: a chat is synced only to the account it was started under (accountUserId) — never to
 * another account that later signs in on this computer, and chats from before this feature, or from
 * while signed out, are never uploaded.
 *
 * Nothing here changes usage: Desktop turns were already metered by the desktop app, and the server
 * never counts them toward any Web message cap.
 */

type Rpc = <T = unknown>(name: string, args: Record<string, unknown>) => Promise<T>;

type OutboxItem =
  | {
      kind: 'turn';
      accountUserId: string;
      sessionId: string;
      title: string;
      turnId: string;
      userText: string;
      assistantText: string;
      accountChatId: string | null;
      startedAt: string;
    }
  | { kind: 'rename'; accountUserId: string; accountChatId: string; title: string }
  | { kind: 'delete'; accountUserId: string; accountChatId: string };

export interface RemoteChatSummary {
  id: string;
  title: string;
  surface: ChatSurface;
  desktopSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RemoteChat extends RemoteChatSummary {
  messages: { role: 'user' | 'assistant'; content: string; surface: ChatSurface; createdAt: string; requestId: string | null }[];
}

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];
const REMOTE_LIST_TTL_MS = 30_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_TEXT = 100_000;

/** Server ids are uuids; desktop ids are uuids or similar — anything else is replaced by a safe id. */
function safeId(id: string): string {
  return ID_PATTERN.test(id) ? id : id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'turn';
}

/** Turns a chat from the account into this app's session shape (read-only text turns). */
export function remoteChatToSession(chat: RemoteChat): ConversationSession {
  const turns: ConversationSessionTurn[] = [];
  let current: ConversationSessionTurn | null = null;
  for (const message of chat.messages) {
    const at = Date.parse(message.createdAt) || Date.now();
    if (message.role === 'user' || !current) {
      current = {
        id: message.requestId ?? `${chat.id}-${turns.length}`,
        startedAt: at,
        endedAt: at,
        transcript: message.role === 'user' ? message.content : '',
        assistantResponse: message.role === 'assistant' ? message.content : '',
        actionsExecuted: [],
        errors: [],
        model: '',
        voice: '',
        endedReason: 'completed',
      };
      turns.push(current);
    } else {
      current.assistantResponse = message.content;
      current.endedAt = at;
    }
  }
  return {
    id: chat.id,
    title: chat.title,
    createdAt: Date.parse(chat.createdAt) || Date.now(),
    updatedAt: Date.parse(chat.updatedAt) || Date.now(),
    pinned: false,
    archived: false,
    turns,
    filesCreated: [],
    applicationsOpened: [],
    accountChatId: chat.id,
    origin: chat.surface,
  };
}

/** The local list plus the account's chats that aren't on this computer, newest first (pinned stay on top). */
export function mergeChatLists(local: ConversationSessionSummary[], localSessions: ConversationSession[], remote: RemoteChatSummary[]): ConversationSessionSummary[] {
  const known = new Set<string>();
  for (const session of localSessions) {
    known.add(session.id);
    if (session.accountChatId) known.add(session.accountChatId);
  }
  const fromAccount: ConversationSessionSummary[] = remote
    .filter((chat) => !known.has(chat.id) && !(chat.desktopSessionId && known.has(chat.desktopSessionId)))
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      createdAt: Date.parse(chat.createdAt) || 0,
      updatedAt: Date.parse(chat.updatedAt) || 0,
      pinned: false,
      archived: false,
      turnCount: 0,
      durationMs: 0,
      lastMessage: '',
      surface: chat.surface,
      remote: true,
    }));
  const withSurface = local.map((summary) => {
    const session = localSessions.find((s) => s.id === summary.id);
    return { ...summary, surface: session?.origin ?? ('desktop' as const) };
  });
  return [...withSurface, ...fromAccount].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export class AccountChatSync {
  private outbox: OutboxItem[] = [];
  private filePath = '';
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private remoteCache: { userId: string; at: number; chats: RemoteChatSummary[] } | null = null;
  /** Told when a desktop session gets its account chat id (so the session store can remember it). */
  onLinked: ((sessionId: string, accountChatId: string) => void) | null = null;

  constructor(
    private readonly rpc: Rpc = callRpcAsUser,
    private readonly currentUserId: () => string | null = () => accessTokenUserId(getServerAccessToken())
  ) {}

  init(directory: string): void {
    this.filePath = path.join(directory, 'account-chat-outbox.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { items?: OutboxItem[] };
      this.outbox = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      this.outbox = [];
    }
    void this.flush();
  }

  /** The signed-in account, or null when signed out. */
  currentAccount(): string | null {
    return this.currentUserId();
  }

  pending(): number {
    return this.outbox.length;
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify({ items: this.outbox }), 'utf-8');
    } catch {
      // The outbox is best-effort; the chat itself is saved locally either way.
    }
  }

  private enqueue(item: OutboxItem): void {
    this.outbox.push(item);
    this.persist();
    this.remoteCache = null;
    void this.flush();
  }

  /** Queues a finished turn of a chat that belongs to the signed-in account. */
  queueTurn(session: ConversationSession, turn: ConversationSessionTurn): void {
    const account = this.currentAccount();
    if (!account || session.accountUserId !== account) return;
    const userText = (turn.transcript ?? '').slice(0, MAX_TEXT);
    const assistantText = (turn.assistantResponse ?? '').slice(0, MAX_TEXT);
    if (!userText.trim() && !assistantText.trim()) return;
    this.enqueue({
      kind: 'turn',
      accountUserId: account,
      sessionId: safeId(session.id),
      title: session.title,
      turnId: safeId(turn.id),
      userText,
      assistantText,
      accountChatId: session.accountChatId ?? null,
      startedAt: new Date(turn.startedAt).toISOString(),
    });
  }

  queueRename(session: { accountUserId?: string; accountChatId?: string }, title: string): void {
    const account = this.currentAccount();
    if (!account || !session.accountChatId || (session.accountUserId && session.accountUserId !== account)) return;
    this.enqueue({ kind: 'rename', accountUserId: account, accountChatId: session.accountChatId, title });
  }

  queueDelete(session: { accountUserId?: string; accountChatId?: string }): void {
    const account = this.currentAccount();
    if (!account || !session.accountChatId || (session.accountUserId && session.accountUserId !== account)) return;
    this.enqueue({ kind: 'delete', accountUserId: account, accountChatId: session.accountChatId });
  }

  /** Sends what is queued for the signed-in account, in order. Stops at the first failure and retries later. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    const account = this.currentAccount();
    if (!account) return;
    this.flushing = true;
    try {
      for (let index = 0; index < this.outbox.length; ) {
        const item = this.outbox[index];
        if (!item) break;
        if (item.accountUserId !== account) {
          index++; // waits for its own account to sign in again
          continue;
        }
        if (item.kind === 'turn') {
          const linkedChat = item.accountChatId ?? this.linkedChatFor(item.sessionId);
          const result = await this.rpc<{ chatId?: string }>('account_chat_sync_desktop_turn', {
            p_session_id: item.sessionId,
            p_title: item.title,
            p_turn_id: item.turnId,
            p_user_text: item.userText,
            p_assistant_text: item.assistantText,
            p_chat_id: linkedChat,
            p_started_at: item.startedAt,
          });
          if (result?.chatId) {
            this.linked.set(item.sessionId, result.chatId);
            this.onLinked?.(item.sessionId, result.chatId);
          }
        } else if (item.kind === 'rename') {
          await this.rpc('account_chat_rename', { p_chat_id: item.accountChatId, p_title: item.title });
        } else {
          await this.rpc('account_chat_delete', { p_chat_id: item.accountChatId });
        }
        this.outbox.splice(index, 1);
        this.persist();
      }
      this.attempt = 0;
    } catch {
      this.scheduleRetry();
    } finally {
      this.flushing = false;
    }
  }

  private linked = new Map<string, string>();
  private linkedChatFor(sessionId: string): string | null {
    return this.linked.get(sessionId) ?? null;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
    this.retryTimer.unref?.();
  }

  /** The account's chats (cached briefly). Empty when signed out or unreachable — the local list still shows. */
  async listRemote(): Promise<RemoteChatSummary[]> {
    const account = this.currentAccount();
    if (!account) return [];
    if (this.remoteCache && this.remoteCache.userId === account && Date.now() - this.remoteCache.at < REMOTE_LIST_TTL_MS) return this.remoteCache.chats;
    try {
      const chats = await this.rpc<RemoteChatSummary[]>('get_my_account_chats', { p_limit: 100 });
      const list = Array.isArray(chats) ? chats : [];
      this.remoteCache = { userId: account, at: Date.now(), chats: list };
      return list;
    } catch {
      return this.remoteCache?.userId === account ? this.remoteCache.chats : [];
    }
  }

  /** One of the account's chats as a session, or undefined. */
  async getRemote(chatId: string): Promise<ConversationSession | undefined> {
    if (!this.currentAccount() || !/^[0-9a-f-]{36}$/i.test(chatId)) return undefined;
    try {
      const chat = await this.rpc<RemoteChat | null>('get_my_account_chat', { p_chat_id: chatId });
      if (!chat || !Array.isArray(chat.messages)) return undefined;
      return { ...remoteChatToSession(chat), accountUserId: this.currentAccount() ?? undefined };
    } catch {
      return undefined;
    }
  }

  /** Forgets the cached account list (e.g. on sign-in / sign-out). */
  invalidate(): void {
    this.remoteCache = null;
    void this.flush();
  }
}

export const accountChatSync = new AccountChatSync();
