import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/supabaseClient', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../auth/AuthenticationProvider', () => ({ authService: {} }));
vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: {} }));

import { buildConversationSyncPayload } from './ConversationSyncPublisher';
import type { ConversationMessage } from '../conversation/ConversationTypes';

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Deployed the app to staging.',
    createdAt: 0,
    status: 'final',
    ...overrides,
  };
}

describe('buildConversationSyncPayload', () => {
  it('carries the role and full content through untruncated when short', () => {
    const result = buildConversationSyncPayload(makeMessage());
    expect(result).toEqual({ role: 'assistant', preview: 'Deployed the app to staging.' });
  });

  it('trims surrounding whitespace', () => {
    const result = buildConversationSyncPayload(makeMessage({ content: '  hello there  ' }));
    expect(result.preview).toBe('hello there');
  });

  it('truncates long content to the preview length and marks it with an ellipsis', () => {
    const longContent = 'x'.repeat(300);
    const result = buildConversationSyncPayload(makeMessage({ content: longContent }));
    expect(result.preview.length).toBe(241);
    expect(result.preview.endsWith('…')).toBe(true);
  });

  it('preserves the user role for user-authored turns', () => {
    const result = buildConversationSyncPayload(makeMessage({ role: 'user', content: 'Install Java' }));
    expect(result.role).toBe('user');
  });
});
