import type { CompanionPersonality } from '../mood/MoodEngine';
import type { Mood } from '../mood/MoodEngine';

export type ThoughtToken =
  | '⚡'
  | '{}'
  | '<>'
  | '💻'
  | '📚'
  | '📝'
  | '💡'
  | '🎨'
  | '✨'
  | '🧠'
  | '☕'
  | '😴'
  | '👀'
  | '📌';

export type ThoughtCloud = {
  mood: Mood;
  tokens: ThoughtToken[];
};

export class ThoughtCloudEngine {
  // Note: must never show user text. Uses symbolic tokens only.
  generate(mood: Mood, _personality: CompanionPersonality): ThoughtCloud {
    switch (mood) {
      case 'focused':
      case 'motivated':
        return { mood, tokens: ['⚡', '{}', '<>', '💻'] };
      case 'creative':
        return { mood, tokens: ['🎨', '✨', '🧠'] };
      case 'curious':
      case 'excited':
        return { mood, tokens: ['💡', '✨', '📌'] };
      case 'happy':
        return { mood, tokens: ['✨', '👀', '📌'] };
      case 'relaxed':
        return { mood, tokens: ['☕', '👀', '📌'] };
      case 'sleepy':
      default:
        return { mood, tokens: ['😴', '☕', '📌'] };
    }
  }
}

