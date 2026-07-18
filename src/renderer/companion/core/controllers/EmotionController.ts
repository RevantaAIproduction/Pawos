import type { Expression } from '../../emotion/EmotionTypes';
import type { CompanionState, CompanionSubsystem } from '../CompanionStates';

const STATE_TO_EXPRESSION: Record<CompanionState, Expression> = {
  idle: 'focused',
  walking: 'happy',
  listening: 'listening',
  thinking: 'thinking',
  talking: 'talking',
  typing: 'thinking',
  celebrating: 'celebrating',
  sleeping: 'sleepy',
  greeting: 'happy',
  sitting: 'celebrating',
  jumping: 'excited',
  disabled: 'focused',
};

/**
 * The "decider" — computes which Expression the companion should be
 * showing right now, from the current CompanionState plus an optional
 * external override (Companion Lab / dashboard-triggered setEmotion
 * commands via the legacy CompanionController, which only apply while
 * truly idle so they don't fight a real conversation/gesture in progress).
 * FacialController is the "effector" that actually paints this onto the
 * face overlay.
 */
export class EmotionController implements CompanionSubsystem {
  private currentState: CompanionState = 'idle';

  constructor(private getExternalOverride: () => Expression | null) {}

  getExpression(): Expression {
    if (this.currentState === 'idle') {
      const override = this.getExternalOverride();
      if (override) return override;
    }
    return STATE_TO_EXPRESSION[this.currentState];
  }

  onEnter(state: CompanionState): void {
    this.currentState = state;
  }
}
