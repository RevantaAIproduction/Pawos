import type { AnimationName } from '../../../avatar/AnimationLibrary';
import type { CompanionState, CompanionSubsystem, RuntimeContext } from '../CompanionStates';

const STATE_TO_CLIP: Partial<Record<CompanionState, AnimationName>> = {
  idle: 'neutral',
  listening: 'happyIdle',
  thinking: 'thinking',
  talking: 'talking',
  typing: 'typing',
  celebrating: 'cheeringWhileSitting',
  sleeping: 'sadIdle',
  greeting: 'happyHandGesture',
  sitting: 'cheeringWhileSitting',
  jumping: 'excited',
  // No dedicated wave/point mocap exists in the animation library — these
  // are honest closest-clip substitutes, same discipline as sitting/
  // sleeping/celebrating above. 'waving' reuses the same hand-gesture clip
  // as 'greeting'; 'pointing' substitutes 'salute' as the closest real
  // directional-arm clip.
  waving: 'happyHandGesture',
  pointing: 'salute',
  disabled: 'neutral',
  // 'walking' is handled specially below — it has direction/run/approach variants.
};

const RUN_CHANCE = 0.35;
const RUN_TIME_SCALE = 1.7;
/** Pixels/sec at a walk — duration then scales with actual distance, so a full-width traversal always looks like a natural, constant walking pace instead of a fixed-time hop that's fast or slow depending on how far the random target happened to be. */
const WALK_SPEED_PX_PER_SEC = 220;
const APPROACH_CHANCE = 0.35; // of walk entries, how many are front/back "approach" instead of left/right
const APPROACH_DURATION_MS = 2200;
const APPROACH_SCALE_IN = 1.15;
const APPROACH_SCALE_OUT = 0.85;
const JUMP_DURATION_MS = 550;
const JUMP_HEIGHT = 0.12;

/** After arriving at a screen edge, this fraction of walks turn into a peek-a-boo instead of just idling in place. */
const PEEK_CHANCE = 0.5;
const PEEK_HOLD_MS = 900;
/** How much of the visible character box slides past the screen edge while "hidden" — not the full box, so there's still a sliver to notice. */
const PEEK_HIDE_RATIO = 0.85;
const PEEK_CYCLES = 2;

const YAW_LEFT = -Math.PI / 2;
const YAW_RIGHT = Math.PI / 2;
const YAW_FORWARD = 0;
const YAW_BACKWARD = Math.PI;
/** Radians/sec the body turns at — a full 180° turn takes ~0.7s, fast enough to read as responsive but not an instant teleport-snap. */
const TURN_SPEED = Math.PI / 0.7;

/** Shortest signed angular distance from `from` to `to`, wrapped to (-π, π] — turning from YAW_LEFT to YAW_BACKWARD should sweep the short way round, not snap. */
function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

type WalkVariant =
  | { kind: 'walk'; startX: number; targetX: number; edge: 'left' | 'right'; y: number; startedAt: number; durationMs: number }
  | { kind: 'approach'; direction: 'forward' | 'backward'; startedAt: number; durationMs: number };

type PeekState = {
  edge: 'left' | 'right';
  visibleX: number;
  hiddenX: number;
  y: number;
  hidden: boolean;
  phaseStartedAt: number;
  cyclesLeft: number;
};

/**
 * The "body" — owns clip selection per CompanionState and the locomotion
 * mechanics (turning to face travel direction, window-slide walking, run
 * via playback-rate, front/back approach via scale, a procedural jump
 * bounce, and an edge peek-a-boo). Ported from what used to be closures
 * inside Avatar3DOverlay's useEffect; now it's just one more subsystem
 * plugged into CompanionRuntime.
 *
 * "run" is the real `walking` clip sped up (setPlaybackRate), not a
 * fabricated clip. "jump" is a procedural position.y bounce on top of the
 * `excited` clip, since no real jump mocap exists in the library.
 *
 * Edge math accounts for ctx.visibleBoxOffset — the overlay window is much
 * wider than the character (see app.module.css's .avatarShell, anchored
 * bottom-left with padding), so targeting the window's own edge would
 * leave the character stopping visibly short of the real screen edge.
 */
export class AnimationController implements CompanionSubsystem {
  private screenWorkArea: { width: number; height: number } | null = null;
  private windowBounds: { x: number; y: number; width: number; height: number } | null = null;
  private baseY = 0;
  private walk: WalkVariant | null = null;
  private peek: PeekState | null = null;
  private jumpStartedAt: number | null = null;
  private targetYaw = 0;
  private currentYaw = 0;
  /** When set, overrides targetYaw every frame — the body turns to face wherever the cursor is (see BodyLookYaw's cursorAngleFromCenter). Cleared (null) to hand facing back to whatever the state/walk logic wants. */
  private cursorYawOverride: number | null = null;

  constructor(ctx: RuntimeContext) {
    ctx.ipc.getScreenWorkArea().then((b) => (this.screenWorkArea = b));
    ctx.ipc.getOverlayWindowBounds().then((b) => (this.windowBounds = b));
    if (ctx.anim.root) {
      this.baseY = ctx.anim.root.position.y;
      this.currentYaw = ctx.anim.root.rotation.y;
      this.targetYaw = this.currentYaw;
    }
  }

  private resetPose(ctx: RuntimeContext): void {
    this.targetYaw = YAW_FORWARD;
    if (ctx.anim.root) {
      ctx.anim.root.scale.setScalar(1);
      ctx.anim.root.position.y = this.baseY;
    }
    ctx.anim.setPlaybackRate('walking', 1);
  }

  private beginWalk(ctx: RuntimeContext): void {
    if (!ctx.anim.root) return;

    if (Math.random() < APPROACH_CHANCE || !this.screenWorkArea || !this.windowBounds) {
      const direction: 'forward' | 'backward' = Math.random() < 0.5 ? 'forward' : 'backward';
      this.targetYaw = direction === 'forward' ? YAW_FORWARD : YAW_BACKWARD;
      ctx.anim.play('walking');
      ctx.anim.setPlaybackRate('walking', Math.random() < RUN_CHANCE ? RUN_TIME_SCALE : 1);
      this.walk = { kind: 'approach', direction, startedAt: Date.now(), durationMs: APPROACH_DURATION_MS };
      return;
    }

    const margin = 16;
    const boxX = ctx.visibleBoxOffset.x;
    const boxWidth = ctx.visibleBoxOffset.width;
    // Target the WINDOW position such that the visible character box's own
    // edge — not the window's — lands at the true screen edge.
    const leftEdge = margin - boxX;
    const rightEdge = Math.max(leftEdge, this.screenWorkArea.width - margin - boxX - boxWidth);
    if (rightEdge <= leftEdge) {
      this.walk = null;
      return;
    }
    // Always walk to the FAR opposite edge — "use the entire display", not a
    // random nearby point that might only be a short, unconvincing hop.
    const isNearLeft = this.windowBounds.x < (leftEdge + rightEdge) / 2;
    const targetX = isNearLeft ? rightEdge : leftEdge;
    const edge: 'left' | 'right' = isNearLeft ? 'right' : 'left';
    const running = Math.random() < RUN_CHANCE;
    const speed = WALK_SPEED_PX_PER_SEC * (running ? RUN_TIME_SCALE : 1);
    const distance = Math.abs(targetX - this.windowBounds.x);
    this.targetYaw = targetX < this.windowBounds.x ? YAW_LEFT : YAW_RIGHT;
    ctx.anim.play('walking');
    ctx.anim.setPlaybackRate('walking', running ? RUN_TIME_SCALE : 1);
    this.walk = {
      kind: 'walk',
      startX: this.windowBounds.x,
      targetX,
      edge,
      y: this.windowBounds.y,
      startedAt: Date.now(),
      durationMs: Math.max(800, (distance / speed) * 1000),
    };
  }

  private startPeek(edge: 'left' | 'right', visibleX: number, y: number, ctx: RuntimeContext): void {
    const hideOffset = ctx.visibleBoxOffset.width * PEEK_HIDE_RATIO;
    const hiddenX = edge === 'left' ? visibleX - hideOffset : visibleX + hideOffset;
    this.peek = { edge, visibleX, hiddenX, y, hidden: false, phaseStartedAt: Date.now(), cyclesLeft: PEEK_CYCLES };
  }

  /** Snaps back to fully visible immediately — used when something more important (voice, a gesture) interrupts mid-peek, so the companion never gets stuck hidden off-screen. */
  private cancelPeek(ctx: RuntimeContext): void {
    if (!this.peek) return;
    void ctx.ipc.moveOverlayWindow(this.peek.visibleX, this.peek.y);
    if (this.windowBounds) this.windowBounds = { ...this.windowBounds, x: this.peek.visibleX };
    this.peek = null;
  }

  /** Whether the current walk/approach/peek cycle has finished — used by ActionController to know when to hand control back to idle. */
  isWalkComplete(): boolean {
    return this.walk === null && this.peek === null;
  }

  /** Turns the body to face wherever the cursor is (full range, not just a head tilt) — angle in radians, 0 = facing the camera. Pass null when the cursor leaves to hand facing back to idle/walk/gesture logic. */
  setCursorLookYaw(angle: number | null): void {
    this.cursorYawOverride = angle;
    if (angle === null) this.targetYaw = YAW_FORWARD;
  }

  onEnter(state: CompanionState, ctx: RuntimeContext): void {
    if (state === 'walking') {
      this.beginWalk(ctx);
      return;
    }
    if (state === 'jumping') {
      if (ctx.anim.root) this.baseY = ctx.anim.root.position.y;
      this.jumpStartedAt = Date.now();
    }
    const clip = STATE_TO_CLIP[state];
    if (clip) ctx.anim.play(clip);
  }

  onExit(state: CompanionState, ctx: RuntimeContext): void {
    if (state === 'walking') {
      this.cancelPeek(ctx); // never leave the window hidden off-screen when something interrupts
      this.resetPose(ctx);
      this.walk = null;
    }
    if (state === 'jumping') {
      this.resetPose(ctx);
      this.jumpStartedAt = null;
    }
  }

  update(deltaSeconds: number, ctx: RuntimeContext): void {
    // Drives the underlying mixer/procedural-motion/face-overlay forward.
    // Without this, the mixer never advances and every clip renders as the
    // raw imported bind pose (a T-pose) regardless of which one is "playing".
    ctx.anim.update(deltaSeconds, ctx.camera);

    if (ctx.anim.root) {
      const goalYaw = this.cursorYawOverride ?? this.targetYaw;
      const delta = shortestAngleDelta(this.currentYaw, goalYaw);
      const maxStep = TURN_SPEED * deltaSeconds;
      this.currentYaw += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
      ctx.anim.root.rotation.y = this.currentYaw;
    }

    if (this.walk) {
      const t = Math.min(1, (Date.now() - this.walk.startedAt) / this.walk.durationMs);
      if (this.walk.kind === 'walk') {
        const x = this.walk.startX + (this.walk.targetX - this.walk.startX) * t;
        void ctx.ipc.moveOverlayWindow(x, this.walk.y);
        if (t >= 1) {
          if (this.windowBounds) this.windowBounds = { ...this.windowBounds, x: this.walk.targetX };
          const { edge, targetX, y } = this.walk;
          this.walk = null;
          if (Math.random() < PEEK_CHANCE) this.startPeek(edge, targetX, y, ctx);
        }
      } else {
        const arc = Math.sin(t * Math.PI);
        const scale =
          this.walk.direction === 'forward'
            ? 1 + (APPROACH_SCALE_IN - 1) * arc
            : 1 - (1 - APPROACH_SCALE_OUT) * arc;
        ctx.anim.root?.scale.setScalar(scale);
        if (t >= 1) this.walk = null;
      }
    }

    if (this.peek) {
      const elapsed = Date.now() - this.peek.phaseStartedAt;
      if (elapsed >= PEEK_HOLD_MS) {
        this.peek.hidden = !this.peek.hidden;
        this.peek.phaseStartedAt = Date.now();
        const x = this.peek.hidden ? this.peek.hiddenX : this.peek.visibleX;
        void ctx.ipc.moveOverlayWindow(x, this.peek.y);
        if (this.windowBounds) this.windowBounds = { ...this.windowBounds, x };
        if (!this.peek.hidden) {
          this.peek.cyclesLeft -= 1;
          if (this.peek.cyclesLeft <= 0) this.peek = null;
        }
      }
    }

    if (this.jumpStartedAt !== null && ctx.anim.root) {
      const t = Math.min(1, (Date.now() - this.jumpStartedAt) / JUMP_DURATION_MS);
      const arc = Math.sin(t * Math.PI);
      ctx.anim.root.position.y = this.baseY + JUMP_HEIGHT * arc;
    }
  }
}
