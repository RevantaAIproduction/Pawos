import type { AnimClip, Expression } from '../../renderer/companion/emotion/EmotionTypes';

/**
 * Backend command surface, sent over IPC (channel: 'companion:command')
 * from any window to whichever window is rendering the companion.
 * Type-only coupling to renderer types — no runtime code crosses the
 * main/renderer boundary.
 */
export type CompanionCommand =
  | { type: 'setEmotion'; expression: Expression }
  | { type: 'playAnimation'; clip: AnimClip }
  | { type: 'lookAt'; target: { x: number; y: number } | null }
  | { type: 'setMood'; mood: string }
  | { type: 'setContext'; context: Record<string, unknown> }
  | { type: 'openConversation'; prefill?: string };
