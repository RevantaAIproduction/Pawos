import type { ContextSnapshot } from '../context/ContextClassifier';

export type Behavior =
  | 'typing_laptop'
  | 'reading'
  | 'brainstorming'
  | 'drinking_coffee'
  | 'researching'
  | 'coding'
  | 'relaxing'
  | 'sleeping'
  | 'wandering';

export type BehaviorSnapshot = {
  behavior: Behavior;
  confidence: number; // 0..1
};

export class BehaviorEngine {
  suggest(args: {
    context: ContextSnapshot;
    mood: string;
    idleSeconds: number;
    typingSeconds: number;
    mouseSeconds: number;
  }): BehaviorSnapshot {
    const { context, mood, idleSeconds, typingSeconds } = args;

    // Idle always gravitates to relaxing/sleeping.
    if (context.context === 'idle' || idleSeconds >= 30) {
      const conf = clamp01(0.55 + (typingSeconds < 0.2 ? 0.15 : 0.0));
      return {
        behavior: mood === 'sleepy' ? 'sleeping' : 'relaxing',
        confidence: conf,
      };
    }

    // Context-driven primary selection.
    switch (context.context) {
      case 'coding':
        return { behavior: 'coding', confidence: clamp01(0.65 + context.confidence * 0.3) };
      case 'studying':
        return { behavior: 'researching', confidence: clamp01(0.6 + context.confidence * 0.35) };
      case 'writing':
        return { behavior: 'brainstorming', confidence: clamp01(0.55 + context.confidence * 0.35) };
      case 'chatting':
        return { behavior: mood === 'excited' ? 'brainstorming' : 'relaxing', confidence: clamp01(0.55 + context.confidence * 0.25) };
      case 'creative':
        return { behavior: 'brainstorming', confidence: clamp01(0.55 + context.confidence * 0.35) };
      case 'gaming':
        return { behavior: typingSeconds > 1.0 ? 'typing_laptop' : 'wandering', confidence: clamp01(0.45 + context.confidence * 0.3) };
      case 'browsing':
        return { behavior: typingSeconds > 1.0 ? 'typing_laptop' : 'reading', confidence: clamp01(0.5 + context.confidence * 0.35) };
      default:
        return { behavior: 'wandering', confidence: 0.4 };
    }
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

