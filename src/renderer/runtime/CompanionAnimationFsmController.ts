import type { CompanionAnimationContext } from './CompanionAnimationFsmContext';
import type { CompanionPhysicsController } from './CompanionPhysicsController';
import { createCompanionAnimationFsm } from './CompanionAnimationFsm';
import type { CompanionAnimState } from './CompanionAnimationFsm';
import type { ConversationState } from '../conversation/ConversationTypes';

export class CompanionAnimationFsmController {
  private ctx: CompanionAnimationContext;
  private fsm!: ReturnType<typeof createCompanionAnimationFsm>;


  private initialized = false;



  private idleState: 'idleLie' | 'idleSleep' | 'active' = 'active';
  private idleLieMs: number;
  private idleSleepMs: number;
  private lastInputAt = performance.now();

  private hasInput = false;
  private conversationState: ConversationState = 'idle';

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
    } else if (idleFor >= this.idleLieMs) {
      this.fsm.transition('idle', this.ctx);
      this.fsm.dispatch({ type: 'IDLE_LIE' }, this.ctx);
    } else {
      // if currently sleeping, wake handled externally
    }

    this.fsm.update?.(dtMs, this.ctx);
    this.ctx.animation.update(dtMs);
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

  setConversationState(state: ConversationState) {
    this.conversationState = state;
    this.applyConversationState();
  }

  private applyConversationState() {
    switch (this.conversationState) {
      case 'listening':
        this.fsm.transition('happy', this.ctx);
        break;
      case 'transcribing':
      case 'thinking':
        this.fsm.transition('typing', this.ctx);
        break;
      case 'speaking':
        this.fsm.transition('happy', this.ctx);
        break;
      case 'waitingForPermission':
        this.fsm.transition('idle', this.ctx);
        break;
      case 'error':
        this.fsm.transition('jumping', this.ctx);
        break;
      case 'idle':
      default:
        break;
    }
  }
}

export { CompanionAnimationFsmController as PetAnimationFsmController };


