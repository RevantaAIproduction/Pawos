import type * as THREE from 'three';
import type { CompanionAnimationController } from '../../avatar/CompanionAnimationController';
import type { ForegroundWindowInfo } from '../../../shared/system/ForegroundWindowInfo';

/**
 * Every behavioral state the companion can be in. Every subsystem
 * (animation, emotion, face, voice, action) reacts to these instead of
 * deciding things independently — this replaces the ad-hoc closures that
 * used to live directly inside Avatar3DOverlay's useEffect.
 *
 * 'greeting' | 'sitting' | 'jumping' are transient gestures — they run to
 * completion (performGesture()) and then hand control back to whichever
 * state comes next, same as 'walking' does internally for its own
 * left/right/forward/backward/run variants.
 */
export type CompanionState =
  | 'idle'
  | 'walking'
  | 'listening'
  | 'thinking'
  | 'talking'
  | 'typing'
  | 'celebrating'
  | 'sleeping'
  | 'greeting'
  | 'sitting'
  | 'jumping'
  | 'disabled';

/**
 * A discrete, explicitly-requested action — the surface a future voice
 * command or Gemini function-call would target (e.g. "sit down" ->
 * requestGesture('sitting')). 'highFive' reuses the 'greeting' state/clip
 * (the real animation library has no dedicated high-five mocap) — an
 * honest substitute, not fabricated animation data.
 */
export type CompanionGesture = 'greeting' | 'sitting' | 'jumping' | 'highFive';

export interface OverlayWindowBridge {
  moveOverlayWindow(x: number, y: number): Promise<boolean>;
  getOverlayWindowBounds(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  getScreenWorkArea(): Promise<{ width: number; height: number }>;
  getForegroundWindowInfo(): Promise<ForegroundWindowInfo>;
}

/** Everything a subsystem needs to act — passed into every lifecycle hook. */
export interface RuntimeContext {
  anim: CompanionAnimationController;
  camera: THREE.Camera;
  ipc: OverlayWindowBridge;
  /**
   * Where the visible character box actually sits within the overlay
   * window, in window-local pixels (measured from the mount element's
   * getBoundingClientRect() — the window itself is much wider than the
   * character, anchored bottom-left with padding via app.module.css's
   * .avatarShell, so edge-walking math must account for this offset or
   * the character visibly stops short of the real screen edge while the
   * window itself is already there).
   */
  visibleBoxOffset: { x: number; width: number };
}

/** Common lifecycle every controller plugs into the runtime with. All hooks are optional. */
export interface CompanionSubsystem {
  onEnter?(state: CompanionState, ctx: RuntimeContext): void;
  onExit?(state: CompanionState, ctx: RuntimeContext): void;
  update?(deltaSeconds: number, ctx: RuntimeContext): void;
}

export type RuntimeEvent = { type: 'stateChanged'; from: CompanionState; to: CompanionState };
export type RuntimeEventListener = (event: RuntimeEvent) => void;
