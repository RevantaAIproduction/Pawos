import { describe, expect, it } from 'vitest';
import { chatTitle, folderName, groupChatsByProject } from './chatsPanelModel';
import type { ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

const chat = (id: string, updatedAt: number, extra: Partial<ConversationSessionSummary> = {}): ConversationSessionSummary => ({
  id, title: id, createdAt: updatedAt, updatedAt, pinned: false, archived: false, turnCount: 1, durationMs: 0, lastMessage: '', ...extra,
});

describe('Chat list grouped by project', () => {
  it('plain chats first, then projects by latest activity; pinned first inside a group; archived hidden', () => {
    const groups = groupChatsByProject([
      chat('resume', 50),
      chat('question', 90),
      chat('pawos-old', 10, { projectFolder: 'C:\\code\\PawOS' }),
      chat('pawos-pinned', 5, { projectFolder: 'c:/code/pawos/', pinned: true }), // same folder, other spelling
      chat('agro', 80, { projectFolder: 'C:\\code\\Godavari-Agro' }),
      chat('gone', 99, { archived: true }),
    ]);
    expect(groups.map((g) => [g.name, g.chats.map((c) => c.id)])).toEqual([
      ['Chats', ['question', 'resume']],
      ['Godavari-Agro', ['agro']],
      ['PawOS', ['pawos-pinned', 'pawos-old']],
    ]);
    expect(groups[0]!.folder).toBeNull();
  });

  it('the open project gets a section even before it has chats (to start one there)', () => {
    const groups = groupChatsByProject([], 'C:\\code\\new-app');
    expect(groups.map((g) => [g.name, g.folder, g.chats.length])).toEqual([
      ['Chats', null, 0],
      ['new-app', 'C:\\code\\new-app', 0],
    ]);
  });

  it('while searching, only sections with matches show', () => {
    const groups = groupChatsByProject([chat('agro', 1, { projectFolder: 'C:\\x\\agro' })], 'C:\\code\\new-app', true);
    expect(groups.map((g) => g.name)).toEqual(['agro']);
  });

  it('folder names and titles', () => {
    expect(folderName('C:\\code\\my-app\\')).toBe('my-app');
    expect(folderName('/home/me/site')).toBe('site');
    expect(chatTitle({ title: ' ', lastMessage: 'chart my sales' })).toBe('chart my sales');
    expect(chatTitle({ title: '', lastMessage: '' })).toBe('Untitled chat');
  });
});
