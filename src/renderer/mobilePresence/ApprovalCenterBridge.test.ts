import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/supabaseClient', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../auth/AuthenticationProvider', () => ({ authService: {} }));
vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: {} }));

import { deriveApprovalSummary } from './ApprovalCenterBridge';
import type { ConversationMessage } from '../conversation/ConversationTypes';

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'This will delete 3 files. Should I proceed?',
    createdAt: 0,
    status: 'final',
    ...overrides,
  };
}

describe('deriveApprovalSummary', () => {
  it("uses the assistant's own confirmation question when present", () => {
    expect(deriveApprovalSummary(makeMessage())).toBe('This will delete 3 files. Should I proceed?');
  });

  it('falls back to an honest generic prompt when there is no last message', () => {
    expect(deriveApprovalSummary(undefined)).toBe('PawOS needs your approval to continue.');
  });

  it('falls back to the generic prompt for a user-authored last message, never fabricating what is being confirmed', () => {
    expect(deriveApprovalSummary(makeMessage({ role: 'user', content: 'yes' }))).toBe(
      'PawOS needs your approval to continue.'
    );
  });

  it('truncates a long confirmation question with an ellipsis', () => {
    const longContent = 'x'.repeat(300);
    const result = deriveApprovalSummary(makeMessage({ content: longContent }));
    expect(result.length).toBe(241);
    expect(result.endsWith('…')).toBe(true);
  });
});
