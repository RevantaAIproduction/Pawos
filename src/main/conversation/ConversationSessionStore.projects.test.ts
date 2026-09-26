import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-sessions-'));
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { conversationSessionStore, sameProjectFolder } from './ConversationSessionStore';
import type { ConversationSessionTurn } from '../../shared/conversation/ConversationSessionTypes';

let n = 0;
const turn = (transcript: string, projectFolder?: string): ConversationSessionTurn => ({
  id: `t${++n}`, startedAt: Date.now(), endedAt: Date.now(), transcript, assistantResponse: 'ok', actionsExecuted: [], errors: [],
  model: 'm', voice: 'v', endedReason: 'completed', ...(projectFolder ? { projectFolder } : {}),
});

describe('Chats belong to the project they started in', () => {
  beforeEach(() => {
    fs.rmSync(path.join(userData, 'conversation-sessions.json'), { force: true });
    conversationSessionStore.init();
  });

  it('a chat started in a project is listed under that project; a plain chat has none', () => {
    const project = conversationSessionStore.appendTurn(turn('fix the login bug', 'C:\\code\\PawOS'), { type: 'new' });
    const plain = conversationSessionStore.appendTurn(turn('make my resume'), { type: 'new' });
    const list = conversationSessionStore.list();
    expect(list.find((s) => s.id === project.id)?.projectFolder).toBe('C:\\code\\PawOS');
    expect(list.find((s) => s.id === plain.id)?.projectFolder).toBeUndefined();
  });

  it('auto-filing never puts a turn into another project\'s chat (or a plain chat into a project)', () => {
    const inProject = conversationSessionStore.appendTurn(turn('fix the login bug', 'C:\\code\\PawOS'), { type: 'new' });
    const plain = conversationSessionStore.appendTurn(turn('what is the weather'), { type: 'auto' });
    expect(plain.id).not.toBe(inProject.id);
    const sameProject = conversationSessionStore.appendTurn(turn('and the signup bug', 'c:/code/pawos/'), { type: 'auto' });
    expect(sameProject.id).toBe(inProject.id);
    const other = conversationSessionStore.appendTurn(turn('style the page', 'C:\\code\\Agro'), { type: 'auto' });
    expect(other.id).not.toBe(inProject.id);
  });

  it('project folders compare case- and slash-insensitively', () => {
    expect(sameProjectFolder('C:\\code\\PawOS\\', 'c:/code/pawos')).toBe(true);
    expect(sameProjectFolder(undefined, '')).toBe(true);
    expect(sameProjectFolder('C:\\a', undefined)).toBe(false);
  });
});
