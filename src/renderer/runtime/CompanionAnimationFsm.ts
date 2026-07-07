import { Fsm, type FsmEvent } from '../fsm/Fsm';
import type { CompanionAnimationContext } from './CompanionAnimationFsmContext';

export type CompanionAnimState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'sleeping'
  | 'typing'
  | 'eating'
  | 'jumping'
  | 'spinning'
  | 'catchBall'
  | 'happy'
  | 'celebrate';

export function createCompanionAnimationFsm(ctx: CompanionAnimationContext) {
  const states: Record<CompanionAnimState, any> = {
    idle: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('idle') },
    walking: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('walking') },
    running: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('running') },
    sleeping: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('sleeping') },
    typing: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('typing') },
    eating: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('eating') },
    jumping: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('jumping') },
    spinning: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('spinning') },
    catchBall: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('catchBall') },
    happy: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('happy') },
    celebrate: { enter: (c: CompanionAnimationContext) => c.animation.setAnimation('celebrate') },
  };

  return new Fsm<CompanionAnimationContext>('idle', states);
}

export type PetAnimState = CompanionAnimState;
export const createPetAnimationFsm = createCompanionAnimationFsm;


