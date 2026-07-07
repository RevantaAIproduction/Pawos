import type { CompanionDefinition } from '../companion/CompanionDefinition';
import type { AnimationPlayer } from '../animations/AnimationPlayer';
import type { Fsm } from '../fsm/Fsm';

export type CompanionAnimationContext = {
  pet: CompanionDefinition;
  animation: AnimationPlayer;

  // motion intent
  moveIntent: { x: number; y: number; speed: number; running: boolean };

  // timers
  requestedIdleAtMs: number;
  inputActive: boolean;

  // environment
  pointer: { x: number; y: number; vx: number; vy: number; movedQuickly: boolean };
};

export type PetAnimationContext = CompanionAnimationContext;

