import type { ConversationState } from '../../conversation/ConversationTypes';
import {
  EXPRESSION_TO_POSTURE,
  EXPRESSION_TO_SPEED,
  type EmotionState,
  type Expression,
  type VoiceTone,
} from './EmotionTypes';

const CONVERSATION_STATE_EXPRESSION: Record<ConversationState, Expression> = {
  idle: 'focused',
  listening: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'happy',
  error: 'confused',
  waitingForPermission: 'curious',
};

/** Lightweight keyword heuristic — not a real sentiment model. Only ever
 * applied to what the companion itself is about to say. */
function sentimentExpression(message: string): Expression | null {
  const lower = message.toLowerCase();
  if (/\b(sorry|apologi[sz]e|my mistake|my fault)\b/.test(lower)) return 'apologetic';
  if (/\b(great|awesome|nice job|congrat|yay|amazing)\b/.test(lower)) return 'excited';
  if (/\b(unfortunately|sad to|unable to|can't|cannot|i'm afraid)\b/.test(lower)) return 'sad';
  if (/\b(proud of you|well done|impressive)\b/.test(lower)) return 'proud';
  if (/\b(haha|lol|funny|hilarious)\b/.test(lower)) return 'laughing';
  if (/\b(hmm|not sure|might be wrong|uncertain)\b/.test(lower)) return 'confused';
  return null;
}

function toneFor(expression: Expression): VoiceTone {
  if (expression === 'excited' || expression === 'celebrating' || expression === 'playful') return 'excited';
  if (expression === 'apologetic' || expression === 'embarrassed' || expression === 'shy') return 'apologetic';
  if (expression === 'sleepy' || expression === 'yawning' || expression === 'relaxed' || expression === 'relieved') {
    return 'calm';
  }
  if (expression === 'angry' || expression === 'frustrated') return 'stern';
  if (expression === 'sad' || expression === 'crying' || expression === 'concerned') return 'gentle';
  return 'warm';
}

/**
 * Decides the companion's expression, blink rate, walking speed, posture,
 * and voice tone from conversation context. This is the "AI decides
 * presentation" layer the architecture calls for — today it consumes
 * conversation state (and optionally the assistant's own outgoing text);
 * it can grow to consume richer signals (mood history, activity context)
 * without any renderer changes, since callers only ever see an EmotionState.
 */
export class CompanionBrain {
  decide(input: {
    conversationState: ConversationState;
    lastAssistantMessage?: string;
    /** Reserved for future richer decision logic (e.g. a persisted mood score). */
    mood?: string;
    /** Reserved for future richer decision logic (e.g. active-app/activity signals). */
    context?: Record<string, unknown>;
  }): EmotionState {
    let expression = CONVERSATION_STATE_EXPRESSION[input.conversationState] ?? 'focused';

    if (input.conversationState === 'speaking' && input.lastAssistantMessage) {
      expression = sentimentExpression(input.lastAssistantMessage) ?? expression;
    }

    return {
      primary: expression,
      blend: { [expression]: 1 },
      eyeDirection: { x: 0, y: 0 },
      blinkRateMs: expression === 'sleepy' || expression === 'relaxed' ? 6000 : 4200,
      voiceTone: toneFor(expression),
      walkSpeedMultiplier: EXPRESSION_TO_SPEED[expression],
      posture: EXPRESSION_TO_POSTURE[expression],
    };
  }
}
