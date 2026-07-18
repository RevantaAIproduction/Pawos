import type { CompanionState, CompanionSubsystem, RuntimeContext } from '../CompanionStates';
import type { EmotionController } from './EmotionController';

/**
 * The "effector" for expression — reads whatever EmotionController decided
 * and paints it onto the face overlay (setExpression + blink rate). Kept
 * separate from EmotionController so "what should I feel" and "how do I
 * show it" can evolve independently (e.g. a future richer face rig would
 * only change this file).
 */
export class FacialController implements CompanionSubsystem {
  constructor(private emotion: EmotionController, private blinkRateMs: number = 4200) {}

  private apply(ctx: RuntimeContext): void {
    ctx.anim.setExpression(this.emotion.getExpression());
    ctx.anim.setBlinkRateMs(this.blinkRateMs);
  }

  onEnter(_state: CompanionState, ctx: RuntimeContext): void {
    this.apply(ctx);
  }

  update(_deltaSeconds: number, ctx: RuntimeContext): void {
    // Re-applies every tick too, so an external override (Companion Lab /
    // dashboard setEmotion command) that doesn't itself cause a
    // CompanionState transition still shows up promptly.
    this.apply(ctx);
  }
}
