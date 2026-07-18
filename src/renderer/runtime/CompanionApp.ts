import { RenderClock } from './RenderClock';
import type { CompanionRuntime } from './CompanionRuntimeTypes';
import type { CompanionAnimationContext } from './CompanionAnimationFsmContext';
import { CompanionAnimationFsmController } from './CompanionAnimationFsmController';
import { CompanionPhysicsController } from './CompanionPhysicsController';
import { CompanionCanvasRenderer } from './CompanionCanvasRenderer';
import { createIdleDetector } from './idle/createIdleDetector';
import { AnimationPlayer } from '../animations/AnimationPlayer';
import type { ConversationState } from '../conversation/ConversationTypes';
import type { AnimClip, EmotionState, Expression } from '../companion/emotion/EmotionTypes';

type ResourceBaseUrl = string;




export type CompanionFsmConsumer = {
  onActivity: (activity: import('../../core/activity/ActivityEngine').ActivitySnapshot) => void;
  onMood: (mood: import('../../core/mood/MoodEngine').MoodSnapshot) => void;
  onBehavior: (behavior: import('../../core/behavior/BehaviorEngine').BehaviorSnapshot) => void;
};

export class CompanionApp {

  private clock = new RenderClock();

  private running = false;

  private fsm?: CompanionAnimationFsmController;
  private physics?: CompanionPhysicsController;
  private renderer?: CompanionCanvasRenderer;

  private runtime: CompanionRuntime;
  private animCtx: CompanionAnimationContext;

  private idleDetector = createIdleDetector({ idleLieMs: 2 * 60_000, idleSleepMs: 5 * 60_000 });

  constructor(private args: {
    pet: CompanionRuntime['pet'];
    canvas: HTMLCanvasElement;
    resourceBaseUrl: string;
    settings: {
      animationSpeed: number;
      enableKeyboardReactions: boolean;
      enableMouseReactions: boolean;
      muted: boolean;
    };
  }) {
    this.runtime = {
      pet: args.pet,
      x: 300,
      y: 300,
      rotation: 0,
      flipX: false,
    };

    this.animCtx = {
      pet: args.pet,
      animation: new AnimationPlayer(args.pet.animations) as any,
      moveIntent: { x: 0, y: 0, speed: 0, running: false },
      requestedIdleAtMs: 0,
      inputActive: false,
      pointer: { x: 0, y: 0, vx: 0, vy: 0, movedQuickly: false },
    } as any;

  }

  async init() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AnimationPlayer } = require('../animations/AnimationPlayer');
    this.animCtx.animation = new AnimationPlayer(this.runtime.pet.animations) as any;
    await this.animCtx.animation.loadAll(this.args.resourceBaseUrl);

    this.renderer = new CompanionCanvasRenderer({ canvas: this.args.canvas });
    this.physics = new CompanionPhysicsController({ pet: this.runtime.pet, initial: this.runtime, settings: this.args.settings });
    this.fsm = new CompanionAnimationFsmController({
      ctx: this.animCtx as any,
      settings: this.args.settings,
      physics: this.physics,
      idleDetector: this.idleDetector,
    });

    this.running = true;
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    // Schedule the next frame in a finally so one bad frame (a null-assertion
    // failure, an unknown animation lookup, etc.) can never permanently
    // stall this loop — it just skips a frame instead of freezing forever.
    try {
      const dtMs = this.clock.tick(now);

      const width = this.args.canvas.width;
      const height = this.args.canvas.height;
      this.physics!.update(dtMs, { width, height });
      this.fsm!.update(dtMs, { width, height });

      this.renderer!.render({
        x: this.physics!.getX(),
        y: this.physics!.getY(),
        rotation: this.physics!.getRotation(),
        size: this.physics!.getSize(),
        flipX: this.physics!.getFlipX(),
        animation: this.animCtx.animation,
      });
    } catch (error) {
      console.error('[CompanionApp] loop frame failed, continuing', error);
    } finally {
      requestAnimationFrame(this.loop);
    }
  };

  stop() {
    this.running = false;
    this.clock.reset();
  }

  onKeyboardInput() {
    this.idleDetector.onInput();
    this.fsm?.onAnyInput();
  }

  onTreat() {
    this.fsm?.onTreat();
  }

  onBall() {
    this.fsm?.onBall();
  }

  onSpin() {
    this.fsm?.onSpin();
  }

  onSalute() {
    this.fsm?.onSalute();
  }

  onCelebrate() {
    this.fsm?.onCelebrate();
  }

  onPickUp() {
    this.fsm?.onPickUp();
  }

  onDrop() {
    this.fsm?.onDrop();
  }

  onBackspacePlayful() {
    this.fsm?.onPlayful();
  }

  onEscapeJump() {
    this.fsm?.onEscapeJump();
  }

  onPointerMove(x: number, y: number, vx: number, vy: number, movedQuickly: boolean) {
    this.idleDetector.onInput();
    this.fsm?.onPointerMove({ x, y, vx, vy, movedQuickly });
  }

  onPointerLeftClick() {
    this.fsm?.onLeftClick();
  }

  onPointerRightClick() {
    this.fsm?.onRightClick();
  }

  onPointerDrag() {
    this.fsm?.onAnyInput();
  }

  setConversationState(state: ConversationState, lastAssistantMessage?: string) {
    this.fsm?.setConversationState(state, lastAssistantMessage);
  }

  setEmotion(expression: Expression) {
    this.fsm?.setEmotion(expression);
  }

  playAnimation(clip: AnimClip) {
    this.fsm?.playAnimation(clip);
  }

  lookAt(target: { x: number; y: number } | null) {
    this.fsm?.lookAt(target);
  }

  setMood(mood: string) {
    this.fsm?.setMood(mood);
  }

  setContext(context: Record<string, unknown>) {
    this.fsm?.setContext(context);
  }

  getEmotion(): EmotionState | undefined {
    return this.fsm?.getEmotion();
  }
}

