import { describe, expect, it } from 'vitest';
import { chatTitle, groupChats } from './chatsPanelModel';
import type { ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

const now = new Date(2026, 8, 26, 15, 0).getTime();
const HOUR = 60 * 60 * 1000;
const chat = (id: string, hoursAgo: number, extra: Partial<ConversationSessionSummary> = {}): ConversationSessionSummary => ({
  id, title: id, createdAt: now - hoursAgo * HOUR, updatedAt: now - hoursAgo * HOUR, pinned: false, archived: false, turnCount: 1, durationMs: 0, lastMessage: '', ...extra,
});

describe('Chats panel list', () => {
  it('pinned first, then Today / Yesterday / Previous 7 days / Older, newest first; archived hidden', () => {
    const groups = groupChats([
      chat('old', 24 * 30),
      chat('today-early', 10),
      chat('today-late', 1),
      chat('yesterday', 20),
      chat('last-week', 24 * 4),
      chat('pinned-old', 24 * 60, { pinned: true }),
      chat('archived', 2, { archived: true }),
    ], now);
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ['Pinned', ['pinned-old']],
      ['Today', ['today-late', 'today-early']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 days', ['last-week']],
      ['Older', ['old']],
    ]);
  });

  it('no chats → no groups', () => {
    expect(groupChats([], now)).toEqual([]);
  });

  it('title falls back to the last message, then "Untitled chat"', () => {
    expect(chatTitle({ title: 'Fix login bug', lastMessage: 'x' })).toBe('Fix login bug');
    expect(chatTitle({ title: ' ', lastMessage: 'chart my sales' })).toBe('chart my sales');
    expect(chatTitle({ title: '', lastMessage: '' })).toBe('Untitled chat');
  });
});
