/**
 * What's in the foreground right now, classified for the companion's
 * environment-awareness behavior — see src/main/system/ForegroundWindowWatcher.ts.
 */
export type ForegroundWindowInfo =
  | { kind: 'fullscreen' }
  | { kind: 'app'; bounds: { x: number; y: number; width: number; height: number }; title: string; processName: string }
  | { kind: 'none' };
