import type { ConversationSnapshot, ConversationMessage } from './ConversationTypes';
import type { ConversationSession } from '../../shared/conversation/ConversationSessionTypes';

/**
 * Convert a persisted ConversationSession into a ConversationSnapshot that
 * can be passed directly to ConversationPanel. The restored session is treated
 * as read-only history — all messages have status 'final' and state is 'completed'.
 */
export function restoreConversationSnapshot(session: ConversationSession | null | undefined): ConversationSnapshot | null {
  if (!session) return null;

  const messages: ConversationMessage[] = [];

  // Convert each turn into user + assistant messages
  for (const turn of session.turns) {
    // User message from transcript
    if (turn.transcript) {
      messages.push({
        id: `${turn.id}-user`,
        role: 'user',
        content: turn.transcript,
        createdAt: turn.startedAt,
        status: 'final',
      });
    }

    // Assistant message from assistantResponse
    if (turn.assistantResponse) {
      messages.push({
        id: `${turn.id}-assistant`,
        role: 'assistant',
        content: turn.assistantResponse,
        createdAt: turn.endedAt ?? turn.startedAt,
        status: 'final',
      });
    }
  }

  // Restored conversations are complete history, not live
  const snapshot: ConversationSnapshot = {
    panelOpen: true,
    state: 'completed',
    messages,
    draftTranscript: '',
    errorMessage: null,
    supportsSpeechRecognition: false,
    supportsSpeechSynthesis: false,
    voiceOutputEnabled: false,
    speechPlaybackState: 'off',
    pendingConfirmation: false,
  };

  return snapshot;
}
