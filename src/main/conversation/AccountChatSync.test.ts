import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-account-chats-'));
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { conversationSessionStore } from './ConversationSessionStore';
import { AccountChatSync, mergeChatLists, remoteChatToSession, type RemoteChatSummary } from './AccountChatSync';
import { chatOriginBadge } from '../../renderer/conversation/chatsPanelModel';
import type { ConversationSessionTurn } from '../../shared/conversation/ConversationSessionTypes';

/**
 * The same chats on PawOS Desktop, Web and mobile: this computer's chats go to the signed-in
 * account (text only, the account's own chats only, retried until delivered), and the account's
 * chats from elsewhere show here and continue as the same chat. The server is a fake RPC.
 */

let n = 0;
const turn = (transcript: string, reply = 'ok'): ConversationSessionTurn => ({
  id: `turn-${++n}`,
  startedAt: Date.now(),
  endedAt: Date.now(),
  transcript,
  assistantResponse: reply,
  actionsExecuted: [{ type: 'runCommand', ok: true, label: 'npm test' }],
  errors: [],
  model: 'm',
  voice: 'v',
  endedReason: 'completed',
  evidence: [{ id: 'e1', phase: 'after', kind: 'output', provider: 'x', label: 'secret output', targetDescription: 'C:\\code\\secret.txt' }],
});

type Call = { name: string; args: Record<string, unknown> };

function fakeServer() {
  const calls: Call[] = [];
  let online = true;
  let nextChat = 0;
  const chats = new Map<string, string>(); // desktop session id → chat id
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (!online) throw new Error('offline');
    calls.push({ name, args });
    if (name === 'account_chat_sync_desktop_turn') {
      const chatId = (args.p_chat_id as string | null) ?? chats.get(String(args.p_session_id)) ?? `00000000-0000-4000-8000-${String(++nextChat).padStart(12, '0')}`;
      chats.set(String(args.p_session_id), chatId);
      return { chatId, stored: true };
    }
    if (name === 'get_my_account_chats') return remoteList;
    if (name === 'get_my_account_chat') return remoteChat;
    return true;
  });
  let remoteList: RemoteChatSummary[] = [];
  let remoteChat: unknown = null;
  return {
    rpc,
    calls,
    setOnline: (value: boolean) => (online = value),
    setRemote: (list: RemoteChatSummary[], chat: unknown = null) => {
      remoteList = list;
      remoteChat = chat;
    },
  };
}

const WEB_CHAT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  fs.rmSync(path.join(userData, 'conversation-sessions.json'), { force: true });
  fs.rmSync(path.join(userData, 'account-chat-outbox.json'), { force: true });
  conversationSessionStore.init();
});

describe('syncing this computer\'s chats to the account', () => {
  it('sends each finished turn — text only — and links the chat to its account id', async () => {
    const server = fakeServer();
    const sync = new AccountChatSync(server.rpc, () => 'user-a');
    sync.onLinked = (sessionId, chatId) => conversationSessionStore.linkAccountChat(sessionId, chatId);
    sync.init(userData);

    const session = conversationSessionStore.appendTurn(turn('Fix the login bug', 'Fixed auth.ts'), { type: 'new' }, undefined, sync.currentAccount());
    sync.queueTurn(session, session.turns[0]);
    await vi.waitFor(() => expect(server.calls).toHaveLength(1));

    const sent = server.calls[0];
    expect(sent.name).toBe('account_chat_sync_desktop_turn');
    expect(sent.args).toMatchObject({ p_session_id: session.id, p_user_text: 'Fix the login bug', p_assistant_text: 'Fixed auth.ts', p_chat_id: null });
    // Tool output, evidence and local paths stay on this computer.
    expect(JSON.stringify(sent.args)).not.toMatch(/npm test|secret output|secret\.txt/);
    expect(conversationSessionStore.get(session.id)?.accountChatId).toMatch(/^00000000-/);
    expect(conversationSessionStore.get(session.id)?.accountUserId).toBe('user-a');
  });

  it('never uploads chats from before sign-in, or another account\'s chats', async () => {
    const server = fakeServer();
    let account: string | null = null;
    const sync = new AccountChatSync(server.rpc, () => account);
    sync.init(userData);

    const signedOut = conversationSessionStore.appendTurn(turn('private, signed out'), { type: 'new' }, undefined, sync.currentAccount());
    sync.queueTurn(signedOut, signedOut.turns[0]);
    account = 'user-a';
    const fromA = conversationSessionStore.appendTurn(turn('from account A'), { type: 'new' }, undefined, sync.currentAccount());
    account = 'user-b'; // someone else signs in on this computer
    sync.queueTurn(fromA, fromA.turns[0]);
    sync.queueTurn(signedOut, signedOut.turns[0]);
    await sync.flush();
    expect(server.calls).toHaveLength(0);
  });

  it('keeps turns made offline and sends them once back online — and after a restart', async () => {
    const server = fakeServer();
    server.setOnline(false);
    const sync = new AccountChatSync(server.rpc, () => 'user-a');
    sync.init(userData);
    const session = conversationSessionStore.appendTurn(turn('offline turn'), { type: 'new' }, undefined, 'user-a');
    sync.queueTurn(session, session.turns[0]);
    await sync.flush();
    expect(sync.pending()).toBe(1);

    // The app restarts: the outbox is still there.
    server.setOnline(true);
    const restarted = new AccountChatSync(server.rpc, () => 'user-a');
    restarted.init(userData);
    await vi.waitFor(() => expect(server.calls.filter((c) => c.name === 'account_chat_sync_desktop_turn')).toHaveLength(1));
    expect(restarted.pending()).toBe(0);
  });

  it('a rename and a delete reach the account too', async () => {
    const server = fakeServer();
    const sync = new AccountChatSync(server.rpc, () => 'user-a');
    sync.init(userData);
    sync.queueRename({ accountUserId: 'user-a', accountChatId: WEB_CHAT_ID }, 'Login fix');
    sync.queueDelete({ accountUserId: 'user-a', accountChatId: WEB_CHAT_ID });
    await vi.waitFor(() => expect(server.calls.map((c) => c.name)).toEqual(['account_chat_rename', 'account_chat_delete']));
  });
});

describe('the account\'s chats from Web, mobile and other computers', () => {
  const webChat: RemoteChatSummary = { id: WEB_CHAT_ID, title: 'Plan from my phone', surface: 'web', desktopSessionId: null, createdAt: '2026-10-04T08:00:00Z', updatedAt: '2026-10-04T09:00:00Z' };

  it('appear in the chat list, labelled, without duplicating chats already on this computer', () => {
    const local = conversationSessionStore.appendTurn(turn('local chat'), { type: 'new' }, undefined, 'user-a');
    conversationSessionStore.linkAccountChat(local.id, '22222222-2222-4222-8222-222222222222');
    const mirror: RemoteChatSummary = { ...webChat, id: '22222222-2222-4222-8222-222222222222', surface: 'desktop', desktopSessionId: local.id, title: 'local chat' };
    const list = mergeChatLists(conversationSessionStore.list(), [conversationSessionStore.get(local.id)!], [webChat, mirror]);
    expect(list.map((c) => [c.title, c.surface, Boolean(c.remote)])).toEqual(
      expect.arrayContaining([
        ['local chat', 'desktop', false],
        ['Plan from my phone', 'web', true],
      ])
    );
    expect(list).toHaveLength(2);
    expect(chatOriginBadge(list.find((c) => c.remote)!)).toBe('Web');
    expect(chatOriginBadge({ surface: 'desktop', remote: true })).toBe('Other device');
    expect(chatOriginBadge({ surface: 'desktop', remote: false })).toBeNull();
  });

  it('open as a conversation, and continuing one here keeps it the same chat', async () => {
    const server = fakeServer();
    server.setRemote([webChat], {
      ...webChat,
      messages: [
        { role: 'user', content: 'Plan the login fix', surface: 'web', createdAt: '2026-10-04T08:00:00Z', requestId: 'req-1' },
        { role: 'assistant', content: 'Here is the plan.', surface: 'web', createdAt: '2026-10-04T08:00:01Z', requestId: 'req-1' },
      ],
    });
    const sync = new AccountChatSync(server.rpc, () => 'user-a');
    sync.init(userData);

    const remote = await sync.getRemote(WEB_CHAT_ID);
    expect(remote?.turns.map((t) => [t.transcript, t.assistantResponse])).toEqual([['Plan the login fix', 'Here is the plan.']]);
    expect(remote).toMatchObject({ origin: 'web', accountChatId: WEB_CHAT_ID });

    // What the sessions:appendTurn handler does for a "continue" on a chat that isn't here yet.
    conversationSessionStore.importSession(remote!);
    const continued = conversationSessionStore.appendTurn(turn('Now do it'), { type: 'continue', sessionId: WEB_CHAT_ID }, undefined, 'user-a');
    expect(continued.id).toBe(WEB_CHAT_ID);
    expect(continued.turns).toHaveLength(2);
    sync.queueTurn(continued, continued.turns[1]);
    await vi.waitFor(() => expect(server.calls.some((c) => c.name === 'account_chat_sync_desktop_turn')).toBe(true));
    expect(server.calls.find((c) => c.name === 'account_chat_sync_desktop_turn')?.args.p_chat_id).toBe(WEB_CHAT_ID);
  });

  it('signed out, only this computer\'s chats show', async () => {
    const server = fakeServer();
    server.setRemote([webChat]);
    const sync = new AccountChatSync(server.rpc, () => null);
    expect(await sync.listRemote()).toEqual([]);
    expect(await sync.getRemote(WEB_CHAT_ID)).toBeUndefined();
    expect(server.calls).toHaveLength(0);
  });

  it('pairs messages into turns', () => {
    const session = remoteChatToSession({
      ...webChat,
      messages: [
        { role: 'user', content: 'a', surface: 'web', createdAt: '2026-10-04T08:00:00Z', requestId: 'r1' },
        { role: 'assistant', content: 'b', surface: 'web', createdAt: '2026-10-04T08:00:01Z', requestId: 'r1' },
        { role: 'user', content: 'c', surface: 'desktop', createdAt: '2026-10-04T08:01:00Z', requestId: 'r2' },
      ],
    });
    expect(session.turns.map((t) => [t.transcript, t.assistantResponse])).toEqual([
      ['a', 'b'],
      ['c', ''],
    ]);
  });
});
