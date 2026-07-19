import type { ForegroundWindowInfo } from '../../../../shared/system/ForegroundWindowInfo';
import type { StateRequester } from '../CompanionRuntime';
import type { CompanionState, CompanionSubsystem, RuntimeContext } from '../CompanionStates';
import type { AnimationController } from './AnimationController';

const FOREGROUND_POLL_MS = 1500;
const DOCK_MARGIN = 16;

export type ActionControllerTuning = { walkMinDelayMs: number; walkMaxDelayMs: number; sleepyAfterMs: number };

/** Companion Editor's Behavior tab "Idle behavior" preset — real tuning of how often the companion wanders and how quickly it falls asleep when untouched. 'calm' matches this file's original hardcoded defaults exactly, so existing companions see no change unless the user picks a different preset. */
export const IDLE_BEHAVIOR_TUNING: Record<'active' | 'calm' | 'minimal', ActionControllerTuning> = {
  active: { walkMinDelayMs: 8000, walkMaxDelayMs: 18000, sleepyAfterMs: 90 * 1000 },
  calm: { walkMinDelayMs: 15000, walkMaxDelayMs: 35000, sleepyAfterMs: 3 * 60 * 1000 },
  minimal: { walkMinDelayMs: 60000, walkMaxDelayMs: 120000, sleepyAfterMs: 5 * 60 * 1000 },
};

/**
 * The "scheduler" — decides WHEN idle-life should become walking or
 * sleeping (timing only; AnimationController decides the actual walk
 * variant and mechanics), AND owns environment awareness: what's in the
 * foreground right now (see src/main/system/ForegroundWindowWatcher.ts)
 * changes what the companion does, ranked below voice/gestures but above
 * plain idle wandering —
 *   - a fullscreen app (a movie, a game, a presentation) -> tuck the
 *     window to the nearest screen edge and go to sleep, staying out of
 *     the way until it ends;
 *   - any other real foreground app (the user is working in it) -> perch
 *     the window on top of it, like sitting on a wall, for as long as it
 *     stays focused;
 *   - nothing notable in the foreground -> resume normal idle-life
 *     wandering/sleepy-after-boredom.
 *
 * This is also the surface a future voice command or Gemini function-call
 * would call into for explicit gestures — see CompanionRuntime.performGesture()
 * for sit/jump/greet/high-five, which this controller doesn't own (those
 * are transient gestures, not idle-life/environment scheduling).
 */
export class ActionController implements CompanionSubsystem, StateRequester {
  private nextActivityAt: number;
  private lastInteractionAt = Date.now();
  private isSleepy = false;

  private foreground: ForegroundWindowInfo = { kind: 'none' };
  private lastForegroundPollAt = 0;
  private dockedForForeground = false;

  /**
   * workspaceActiveRef: Workspace Runtime presence hint — set by
   * CompanionExperience.tsx (via a ref, same pattern as VoiceController's
   * isSpeakingRef/conversationStateRef) to whether a task is actively
   * running. Ranked below real foreground-app docking (a more specific,
   * already-real signal) but above idle wandering.
   *
   * celebrateUntilRef: set to a future timestamp the moment a task
   * transitions to 'completed'; while now < that timestamp this outranks
   * everything else (including workspaceActiveRef, which by then may
   * already have flipped back to false as the panel collapses). Reuses
   * the existing 'celebrating' CompanionState/clip; CompanionGesture has
   * no 'celebrating' entry, so this ref is the only live path that can
   * reach it.
   *
   * Both are typed to accept the plain React.RefObject shape (`current`
   * may be `null` before the ref is attached), not just `{ current: T }`.
   */
  constructor(
    private animation: AnimationController,
    private workspaceActiveRef?: { current: boolean | null },
    private celebrateUntilRef?: { current: number | null },
    private tuning: ActionControllerTuning = IDLE_BEHAVIOR_TUNING.calm
  ) {
    this.nextActivityAt = Date.now() + this.randomWalkDelay();
  }

  private randomWalkDelay(): number {
    return this.tuning.walkMinDelayMs + Math.random() * (this.tuning.walkMaxDelayMs - this.tuning.walkMinDelayMs);
  }

  /** Call whenever a real interaction happens (mouse move, conversation activity) — resets the idle/sleepy clock. */
  notifyInteraction(): void {
    this.lastInteractionAt = Date.now();
    this.isSleepy = false;
  }

  private async dockToNearestEdge(ctx: RuntimeContext): Promise<void> {
    const [screenArea, bounds] = await Promise.all([ctx.ipc.getScreenWorkArea(), ctx.ipc.getOverlayWindowBounds()]);
    if (!bounds) return;
    const nearLeft = bounds.x < screenArea.width / 2;
    const targetX = nearLeft ? DOCK_MARGIN : Math.max(DOCK_MARGIN, screenArea.width - bounds.width - DOCK_MARGIN);
    void ctx.ipc.moveOverlayWindow(targetX, bounds.y);
  }

  private async dockOnTopOf(appBounds: { x: number; y: number; width: number }, ctx: RuntimeContext): Promise<void> {
    const [screenArea, bounds] = await Promise.all([ctx.ipc.getScreenWorkArea(), ctx.ipc.getOverlayWindowBounds()]);
    if (!bounds) return;
    const targetX = Math.max(0, Math.min(screenArea.width - bounds.width, appBounds.x + (appBounds.width - bounds.width) / 2));
    const targetY = Math.max(0, appBounds.y - bounds.height);
    void ctx.ipc.moveOverlayWindow(targetX, targetY);
  }

  update(_deltaSeconds: number, ctx: RuntimeContext): void {
    const now = Date.now();
    if (now - this.lastForegroundPollAt > FOREGROUND_POLL_MS) {
      this.lastForegroundPollAt = now;
      void ctx.ipc.getForegroundWindowInfo().then((info) => {
        const wasReactive = this.foreground.kind !== 'none';
        this.foreground = info;
        if (info.kind === 'none' && wasReactive) {
          this.dockedForForeground = false;
          this.notifyInteraction(); // fresh idle timer once we're back to normal wandering
        }
      });
    }

    // Docking moves the window directly, bypassing the state machine — must
    // not race AnimationController's own moveOverlayWindow calls mid-walk/peek.
    if (!this.animation.isWalkComplete()) return;

    if (this.foreground.kind === 'fullscreen' && !this.dockedForForeground) {
      this.dockedForForeground = true;
      void this.dockToNearestEdge(ctx);
    } else if (this.foreground.kind === 'app' && !this.dockedForForeground) {
      this.dockedForForeground = true;
      void this.dockOnTopOf(this.foreground.bounds, ctx);
    }
  }

  desiredState(now: number, current: CompanionState): CompanionState | null {
    // A walk (including its peek-a-boo tail) must finish before the
    // environment gets to reclaim the companion — otherwise, since some
    // foreground app is focused almost all the time during normal computer
    // use, every walk gets interrupted mid-stride and immediately docked
    // elsewhere, which looks like the companion barely starts walking,
    // snaps away, and never actually finishes crossing the screen.
    if (current === 'walking' && !this.animation.isWalkComplete()) return 'walking';

    if (this.celebrateUntilRef && now < (this.celebrateUntilRef.current ?? 0)) return 'celebrating';

    if (this.foreground.kind === 'fullscreen') return 'sleeping';
    if (this.foreground.kind === 'app') return 'sitting';
    if (this.workspaceActiveRef?.current) return 'sitting';

    if (current === 'walking') {
      this.nextActivityAt = now + this.randomWalkDelay();
      return null;
    }

    const idleMs = now - this.lastInteractionAt;
    if (!this.isSleepy && idleMs > this.tuning.sleepyAfterMs) {
      this.isSleepy = true;
      return 'sleeping';
    }
    if (this.isSleepy) return 'sleeping';

    if (now >= this.nextActivityAt) return 'walking';
    return null;
  }
}
