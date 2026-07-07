import type { ActivitySnapshot, ActivityCategory, MouseLevel, TypingLevel } from '../activity/ActivityEngine';

export type ContextCategory =
  | 'coding'
  | 'writing'
  | 'studying'
  | 'chatting'
  | 'creative'
  | 'gaming'
  | 'meeting'
  | 'browsing'
  | 'idle';

export type ContextSnapshot = {
  context: ContextCategory;
  confidence: number; // 0..1
  // privacy-safe coarse signals
  typingLevel: TypingLevel;
  mouseLevel: MouseLevel;
};

export class ContextClassifier {
  classify(activity: ActivitySnapshot): ContextSnapshot {
    const { category, typingLevel, mouseLevel } = activity;

    const mapped = this.map(category);
    const confidence = this.confidence(category, typingLevel, mouseLevel, activity.idleSeconds);

    return {
      context: mapped,
      confidence,
      typingLevel,
      mouseLevel,
    };
  }

  private map(category: ActivityCategory): ContextCategory {
    switch (category) {
      case 'CODING':
        return 'coding';
      case 'WORK':
        // Treat work as writing/studying depending on typing
        return 'writing';
      case 'STUDY':
        return 'studying';
      case 'CHAT':
        return 'chatting';
      case 'CREATIVE':
        return 'creative';
      case 'GAMING':
        return 'gaming';
      case 'MEETING':
        return 'meeting';
      case 'BROWSING':
        return 'browsing';
      case 'IDLE':
      default:
        return 'idle';
    }
  }

  private confidence(category: ActivityCategory, typing: TypingLevel, mouse: MouseLevel, idleSeconds: number): number {
    if (idleSeconds >= 30) return 1.0;

    let c = 0.55;
    if (typing === 'high') c += 0.2;
    if (typing === 'medium') c += 0.1;
    if (mouse === 'high') c += 0.1;

    // Category mapping itself
    if (category === 'CODING' || category === 'CREATIVE' || category === 'CHAT' || category === 'GAMING') c += 0.25;
    if (category === 'MEETING') c += 0.15;
    if (category === 'BROWSING') c += 0.05;

    return Math.max(0, Math.min(1, c));
  }
}

