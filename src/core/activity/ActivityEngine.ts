export type ActivityCategory =
  | 'WORK'
  | 'CODING'
  | 'STUDY'
  | 'CHAT'
  | 'CREATIVE'
  | 'GAMING'
  | 'MEETING'
  | 'BROWSING'
  | 'IDLE';

export type TypingLevel = 'none' | 'low' | 'medium' | 'high';
export type MouseLevel = 'none' | 'low' | 'medium' | 'high';

export type ActivitySnapshot = {
  activeApp: string;
  category: ActivityCategory;
  typingLevel: TypingLevel;
  mouseLevel: MouseLevel;
  idleSeconds: number;
  // privacy-safe signals only
  typingSeconds: number;
  mouseSeconds: number;
};

export type ActivityInputs = {
  nowMs: number;
  idleSeconds: number;
  typingSeconds: number;
  mouseSeconds: number;
  activeApp: string;
};

function toLevel(seconds: number, thresholds: { low: number; medium: number; high: number }): 'none' | 'low' | 'medium' | 'high' {
  if (seconds <= thresholds.low / 2) return 'none';
  if (seconds < thresholds.medium) return 'low';
  if (seconds < thresholds.high) return 'medium';
  return 'high';
}

export class ActivityEngine {
  private lastSnapshot?: ActivitySnapshot;

  // Heuristic thresholds in seconds over recent window
  private typingThresholds = { low: 0.4, medium: 1.2, high: 2.0 };
  private mouseThresholds = { low: 0.3, medium: 0.9, high: 1.6 };

  constructor(private opts?: { idleSecondsCap?: number }) {}

  snapshot(input: ActivityInputs): ActivitySnapshot {
    const typingLevel = toLevel(input.typingSeconds, this.typingThresholds);
    const mouseLevel = toLevel(input.mouseSeconds, this.mouseThresholds);

    const idle = input.idleSeconds >= 30;
    const category: ActivityCategory = this.classify(
      input.activeApp,
      typingLevel,
      mouseLevel,
      input.idleSeconds,
      idle
    );

    const snap: ActivitySnapshot = {
      activeApp: input.activeApp,
      category,
      typingLevel,
      mouseLevel,
      idleSeconds: input.idleSeconds,
      typingSeconds: input.typingSeconds,
      mouseSeconds: input.mouseSeconds,
    };

    this.lastSnapshot = snap;
    return snap;
  }


  getLastSnapshot(): ActivitySnapshot | undefined {
    return this.lastSnapshot;
  }

  private classify(activeApp: string, typing: TypingLevel, mouse: MouseLevel, idleSeconds: number, idle: boolean): ActivityCategory {
    if (idle) return 'IDLE';

    const app = activeApp.toLowerCase();
    const typingHigh = typing === 'high' || typing === 'medium';
    const mouseHigh = mouse === 'high' || mouse === 'medium';

    // Privacy-safe classification based only on app identity and coarse signals.
    // Note: real implementation should move app detection into a native/IPC provider.
    if (app.includes('code') || app.includes('cursor') || app.includes('windsurf') || app.includes('vscode')) return 'CODING';
    if (app.includes('word') || app.includes('document') || app.includes('notion') || app.includes('writer')) return 'STUDY';
    if (app.includes('excel') || app.includes('sheet') || app.includes('powerpoint') || app.includes('slides')) return 'WORK';
    if (app.includes('discord') || app.includes('slack') || app.includes('whatsapp') || app.includes('teams') || app.includes('messenger')) return 'CHAT';
    if (app.includes('photoshop') || app.includes('figma') || app.includes('illustrator') || app.includes('gimp')) return 'CREATIVE';
    if (app.includes('game') || app.includes('steam') || app.includes('epic')) return 'GAMING';
    if (app.includes('meeting') || app.includes('zoom') || app.includes('meet') || app.includes('teams')) return 'MEETING';

    if (typingHigh) return 'WORK';
    if (mouseHigh) return 'BROWSING';
    if (idleSeconds < 30) return 'IDLE';

    return 'BROWSING';
  }
}

