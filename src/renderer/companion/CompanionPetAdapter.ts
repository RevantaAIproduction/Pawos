import type { ActivitySnapshot } from '../../core/activity/ActivityEngine';
import type { Companion } from '../../core/types/CompanionTypes';
import type { CompanionAdapter, CompanionRuntimeContext } from '../../core/runtime/MultiCompanionRuntime';

import type { CompanionAnimationFsmController } from '../runtime/CompanionAnimationFsmController';

export type CompanionPetAdapter = {
  companion: Companion;
  adapter: CompanionAdapter;
};

export function createCompanionPetAdapter(args: {
  companion: Companion;
  fsm: CompanionAnimationFsmController;
}): CompanionPetAdapter {
  const { companion, fsm } = args;

  const adapter: CompanionAdapter = {
    onActivity: (_companion, activity: ActivitySnapshot, _ctx: CompanionRuntimeContext) => {
      // Activity → Context/Mood/Behavior will be wired in via runtime tick adapter next.
      fsm.onActivity?.(activity);
    },
  };

  return { companion, adapter };
}


