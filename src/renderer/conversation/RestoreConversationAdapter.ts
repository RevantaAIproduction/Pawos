import type { ConversationSnapshot, ConversationMessage, ChatEvidenceImage } from './ConversationTypes';
import { outputEvidenceMessage } from './evidenceMessages';
import type { ConversationSession } from '../../shared/conversation/ConversationSessionTypes';

/**
 * Convert a persisted ConversationSession into a ConversationSnapshot that
 * can be passed directly to ConversationPanel. The restored session is treated
 * as read-only history — all messages have status 'final' and state is 'completed'.
 */
export function restoreConversationSnapshot(session: ConversationSession | null | undefined): ConversationSnapshot | null {
  if (!session) return null;

  const messages: ConversationMessage[] = [];
  const allEvidence = new Map(session.turns.flatMap((t) => t.evidence ?? []).map((ref) => [ref.id, ref] as const));

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

    // Visuals PawOS drew this turn, in order, before its reply (same place they appeared live).
    (turn.widgets ?? []).forEach((widget, index) => {
      messages.push({
        id: `${turn.id}-widget-${index}`,
        role: 'assistant',
        content: '',
        createdAt: turn.startedAt,
        status: 'final',
        widget,
      });
    });

    // Evidence captured this turn — screenshots load on demand (local cache, else the run's durable copy);
    // output evidence is its labelled text block, as it appeared live.
    const turnEvidence = turn.evidence ?? [];
    for (const ref of turnEvidence) {
      if (ref.kind === 'output' && ref.output) {
        messages.push({ id: `evidence-${ref.id}`, role: 'assistant', content: outputEvidenceMessage(ref.phase, ref.output), createdAt: turn.startedAt, status: 'final' });
        continue;
      }
      if (ref.kind !== 'image') continue;
      const image = (r: typeof ref): ChatEvidenceImage => ({
        evidenceId: r.id,
        ...(r.runId ? { runId: r.runId } : {}),
        phase: r.phase,
        label: r.label,
        provider: r.provider,
        targetDescription: r.targetDescription,
        filePath: '',
        imageDataUrl: '',
        ...(r.pageSignals ? { pageSignals: r.pageSignals } : {}),
      });
      const before = ref.beforeId ? allEvidence.get(ref.beforeId) : undefined;
      messages.push({
        id: `evidence-${ref.id}`,
        role: 'assistant',
        content: '',
        createdAt: turn.startedAt,
        status: 'final',
        evidence: before && before.kind === 'image' ? { ...image(ref), before: image(before) } : image(ref),
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
