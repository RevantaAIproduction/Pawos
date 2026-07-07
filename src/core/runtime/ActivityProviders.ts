import type { ActivityInputs } from '../activity/ActivityEngine';

// Privacy-safe abstraction: providers must NOT expose raw keystrokes or raw text.
// They should produce coarse signals only (idle duration, typing duration, mouse movement duration,
// active app name only).

export type ActivityInputsSnapshot = Pick<ActivityInputs, 'activeApp' | 'idleSeconds' | 'typingSeconds' | 'mouseSeconds'>;

export interface ActivityProvider {
  getSnapshot(nowMs: number): Omit<ActivityInputsSnapshot, never>;
}

