import type { CompanionAnimationContext } from './CompanionAnimationFsmContext';
import type { CompanionPhysicsController } from './CompanionPhysicsController';
import { createCompanionAnimationFsm } from './CompanionAnimationFsm';
import type { CompanionAnimState } from './CompanionAnimationFsm';
import type { ConversationState } from '../conversation/ConversationTypes';
import { CompanionBrain } from '../companion/emotion/CompanionBrain';
import {
  EXPRESSION_TO_CLIP,
  EXPRESSION_TO_SPEED,
  type AnimClip,
  type EmotionState,
  type Expression,
} from '../companion/emotion/EmotionTypes';

// "Idle life": the companion should never sit perfectly still while active.
// Every so often it plays a brief flourish (from real, existing clips only —
// no dedicated look-around/stretch/dance assets exist) before returning to
// normal idle wandering (already handled by CompanionPhysicsController).
const IDLE_LIFE_MIN_GAP_MS = 15_000;
const IDLE_LIFE_JITTER_MS = 25_000;
const IDLE_LIFE_FLOURISH_DURATION_MS = 1_800;
const IDLE_LIFE_FLOURISHES: Expression[] = ['curious', 'playful', 'happy', 'determined', 'proud'];

export class CompanionAnimationFsmController {
  private ctx: CompanionAnimationContext;
  private physics!: CompanionPhysicsController;
  private fsm!: ReturnType<typeof createCompanionAnimationFsm>;
  private brain = new CompanionBrain();


  private initialized = false;



  private idleState: 'idleLie' | 'idleSleep' | 'active' = 'active';
  private idleLieMs: number;
  private idleSleepMs: number;
  private lastInputAt = performance.now();

  private hasInput = false;
  private conversationState: ConversationState = 'idle';
  private lastAssistantMessage: string | undefined;
  private mood: string | undefined;
  private context: Record<string, unknown> | undefined;
  private gazeTarget: { x: number; y: number } | null = null;
  private idleLifeNextAt = performance.now() + IDLE_LIFE_MIN_GAP_MS + Math.random() * IDLE_LIFE_JITTER_MS;
  private idleLifeFlourishUntil = 0;

  constructor(args: {
    ctx: CompanionAnimationContext;

    settings: {
      animationSpeed: number;
      enableKeyboardReactions: boolean;
      enableMouseReactions: boolean;
      muted: boolean;
    };
    physics: CompanionPhysicsController;
    idleDetector: { onInput: () => void; getState: () => { state: 'active' | 'lie' | 'sleep' }; idleLieMs: number; idleSleepMs: number };
  }) {
    this.ctx = args.ctx;
    this.physics = args.physics;
    this.fsm = createCompanionAnimationFsm(this.ctx);
    this.idleLieMs = args.idleDetector.idleLieMs;
    this.idleSleepMs = args.idleDetector.idleSleepMs;
  }

  update(dtMs: number, _bounds: { width: number; height: number }) {
    if (this.conversationState !== 'idle') {
      this.applyConversationState();
      this.fsm.update?.(dtMs, this.ctx);
      this.ctx.animation.update(dtMs);
      return;
    }

    // idle state drives animation
    const now = performance.now();
    if (this.hasInput) {
      this.lastInputAt = now;
      this.hasInput = false;
    }

    const idleFor = now - this.lastInputAt;
    if (idleFor >= this.idleSleepMs) {
      this.fsm.transition('sleeping', this.ctx);
      this.idleLifeFlourishUntil = 0;
    } else if (idleFor >= this.idleLieMs) {
      this.fsm.transition('idle', this.ctx);
      this.fsm.dispatch({ type: 'IDLE_LIE' }, this.ctx);
      this.idleLifeFlourishUntil = 0;
    } else {
      this.updateIdleLife(now);
    }

    this.fsm.update?.(dtMs, this.ctx);
    this.ctx.animation.update(dtMs);
  }

  /** Picks an occasional flourish so the companion feels alive while idle, without disrupting wandering. */
  private updateIdleLife(now: number) {
    if (this.idleLifeFlourishUntil !== 0) {
      if (now >= this.idleLifeFlourishUntil) {
        this.fsm.transition('idle', this.ctx);
        this.idleLifeFlourishUntil = 0;
        this.idleLifeNextAt = now + IDLE_LIFE_MIN_GAP_MS + Math.random() * IDLE_LIFE_JITTER_MS;
      }
      return;
    }

    if (now >= this.idleLifeNextAt) {
      const expression = IDLE_LIFE_FLOURISHES[Math.floor(Math.random() * IDLE_LIFE_FLOURISHES.length)];
      this.fsm.transition(EXPRESSION_TO_CLIP[expression], this.ctx);
      this.idleLifeFlourishUntil = now + IDLE_LIFE_FLOURISH_DURATION_MS;
    }
  }

  onAnyInput() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.hasInput = true;
    this.fsm.transition('idle', this.ctx);
  }

  onPointerMove(input: { x: number; y: number; vx: number; vy: number; movedQuickly: boolean }) {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.ctx.pointer = { ...input };
    if (input.movedQuickly) {
      this.fsm.transition('running', this.ctx);
    } else {
      this.fsm.transition('walking', this.ctx);
    }
  }

  onLeftClick() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('happy', this.ctx);
  }

  onRightClick() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('happy', this.ctx);
  }

  onTreat() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('eating', this.ctx);
  }

  onBall() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('catchBall', this.ctx);
  }

  onSpin() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('spinning', this.ctx);
  }

  onSalute() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('happy', this.ctx);
  }

  onCelebrate() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('celebrate', this.ctx);
  }

  onPickUp() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('happy', this.ctx);
  }

  onDrop() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('idle', this.ctx);
  }

  onPlayful() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('happy', this.ctx);
  }

  onEscapeJump() {
    if (this.conversationState !== 'idle') {
      return;
    }
    this.fsm.transition('jumping', this.ctx);
  }

  onEnterAsBall() {
    this.onBall();
  }

  // --- CompanionOS intelligence hooks (non-breaking) ---
  // If user explicitly triggers actions (keyboard/mouse), those transitions should remain dominant.
  // We implement this by transitioning only if not currently in a “direct action” window.
  // When the user directly triggers a transition (keyboard/mouse/treat/etc.), pipeline-driven
  // suggestions must not immediately override that intention.
  private explicitActionUntilMs = 0;

  private blockIfExplicit(now = performance.now()) {
    return now < this.explicitActionUntilMs;
  }

  private onExplicitAction(durationMs: number) {
    const now = performance.now();
    this.explicitActionUntilMs = Math.max(this.explicitActionUntilMs, now + durationMs);
  }

  onActivity(activity: import('../../core/activity/ActivityEngine').ActivitySnapshot) {
    const now = performance.now();
    if (this.blockIfExplicit(now)) return;

    // If FSM isn't initialized yet, avoid calling into it.
    if (!this.fsm) return;



    // Activity idle drives the existing sleep/lie FSM via the controller’s own idle timing.
    // For non-idle activities we only choose a sensible base state.
    if (activity.category === 'IDLE') {
      // Let idleDetector logic handle precise timing.
      return;
    }

    // Use typing/mouse intensity to bias toward typing or movement.
    if (activity.typingLevel === 'high' || activity.typingLevel === 'medium') {
      this.fsm.transition('typing', this.ctx);
    } else if (activity.mouseLevel === 'high' || activity.mouseLevel === 'medium') {
      this.fsm.transition('running', this.ctx);
    }

  }

  onMood(_mood: import('../../core/mood/MoodEngine').MoodSnapshot) {
    // Mood can be used later for intensity tuning; for now it biases to typing/happy/sleep.
  }


  onBehavior(behavior: import('../../core/behavior/BehaviorEngine').BehaviorSnapshot) {

    // Map behavior suggestions to existing FSM transitions.
    const now = performance.now();
    if (this.blockIfExplicit(now)) return;


    switch (behavior.behavior) {
      case 'sleeping':
        this.fsm.transition('sleeping', this.ctx);
        break;
      case 'coding':
      case 'typing_laptop':
        this.fsm.transition('typing', this.ctx);
        break;

      case 'relaxing':
        this.fsm.transition('idle', this.ctx);
        break;
      case 'reading':
        this.fsm.transition('idle', this.ctx);
        break;
      case 'wandering':
        this.fsm.transition('walking', this.ctx);
        break;
      case 'brainstorming':
        this.fsm.transition('happy', this.ctx);
        break;
      case 'drinking_coffee':
        this.fsm.transition('eating', this.ctx);
        break;
      default:
        break;
    }

    // prevent rapid flapping / re-overrides immediately after pipeline suggestion
    this.onExplicitAction(800);

  }

  setConversationState(state: ConversationState, lastAssistantMessage?: string) {
    this.conversationState = state;
    this.lastAssistantMessage = lastAssistantMessage;
    this.applyConversationState();
  }

  getEmotion(): EmotionState {
    return {
      ...this.brain.decide({
        conversationState: this.conversationState,
        lastAssistantMessage: this.lastAssistantMessage,
        mood: this.mood,
        context: this.context,
      }),
      eyeDirection: this.gazeTarget ?? { x: 0, y: 0 },
    };
  }

  /** Direct expression override, independent of conversation state — e.g. for future AI tool-calls. */
  setEmotion(expression: Expression) {
    this.fsm.transition(EXPRESSION_TO_CLIP[expression], this.ctx);
    this.physics.setSpeedMultiplier(EXPRESSION_TO_SPEED[expression]);
  }

  /** Direct animation clip override, bypassing expression mapping entirely. */
  playAnimation(clip: AnimClip) {
    this.fsm.transition(clip, this.ctx);
  }

  /**
   * Stores a gaze target for the companion to "look at". The current 2D
   * sprite renderer has no eye rig, so this has no visual effect yet — it
   * is read back via getEmotion().eyeDirection, ready for a future facial
   * rig / RendererAdapter to consume.
   */
  lookAt(target: { x: number; y: number } | null) {
    this.gazeTarget = target;
  }

  setMood(mood: string) {
    this.mood = mood;
  }

  setContext(context: Record<string, unknown>) {
    this.context = context;
  }

  private applyConversationState() {
    if (this.conversationState === 'idle') return;
    const emotion = this.brain.decide({
      conversationState: this.conversationState,
      lastAssistantMessage: this.lastAssistantMessage,
      mood: this.mood,
      context: this.context,
    });
    this.fsm.transition(EXPRESSION_TO_CLIP[emotion.primary], this.ctx);
    this.physics.setSpeedMultiplier(emotion.walkSpeedMultiplier);
  }
}

export { CompanionAnimationFsmController as PetAnimationFsmController };


