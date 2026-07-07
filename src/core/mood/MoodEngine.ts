import type { ContextSnapshot, ContextCategory } from '../context/ContextClassifier';

export type Mood = 'focused' | 'happy' | 'relaxed' | 'curious' | 'excited' | 'sleepy' | 'motivated' | 'creative';

export type CompanionPersonality = {
  // coarse knobs only; no hardcoded content
  energy?: number; // 0..1
  curiosity?: number; // 0..1
  sleepiness?: number; // 0..1
};

export type MoodSnapshot = {
  mood: Mood;
  intensity: number; // 0..1
};

export class MoodEngine {
  // Converts context + time to a mood.
  compute(context: ContextSnapshot, personality: CompanionPersonality, timeOfDay: number): MoodSnapshot {
    const energy = personality.energy ?? 0.6;
    const curiosity = personality.curiosity ?? 0.5;
    const sleepiness = personality.sleepiness ?? 0.4;

    const hour = timeOfDay % 24;
    const nightBoost = hour >= 21 || hour <= 6 ? 1 : 0;

    if (context.context === 'idle') {
      const intensity = Math.max(0, Math.min(1, 0.25 + sleepiness * 0.6 + nightBoost * 0.25));
      return { mood: intensity > 0.55 ? 'sleepy' : 'relaxed', intensity };
    }

    if (context.context === 'coding') {
      const intensity = clamp01(0.4 + energy * 0.35 + context.confidence * 0.35);
      return { mood: intensity > 0.7 ? 'focused' : 'motivated', intensity };
    }

    if (context.context === 'creative') {
      const intensity = clamp01(0.45 + curiosity * 0.4 + context.confidence * 0.25);
      return { mood: intensity > 0.7 ? 'creative' : 'curious', intensity };
    }

    if (context.context === 'chatting') {
      const intensity = clamp01(0.35 + energy * 0.25 + context.confidence * 0.4);
      return { mood: intensity > 0.6 ? 'excited' : 'happy', intensity };
    }

    if (context.context === 'meeting') {
      const intensity = clamp01(0.3 + energy * 0.25 + context.confidence * 0.35);
      return { mood: intensity > 0.6 ? 'focused' : 'relaxed', intensity };
    }

    if (context.context === 'gaming') {
      const intensity = clamp01(0.4 + energy * 0.4 + context.confidence * 0.2);
      return { mood: intensity > 0.65 ? 'excited' : 'motivated', intensity };
    }

    // browsing / studying / writing
    const intensity = clamp01(0.3 + energy * 0.25 + context.confidence * 0.35);
    return { mood: intensity > 0.6 ? 'motivated' : 'relaxed', intensity };
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

