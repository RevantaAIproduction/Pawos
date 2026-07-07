import type { Companion } from '../../core/types/CompanionTypes';
import type { ActivitySnapshot } from '../../core/activity/ActivityEngine';
import type { ContextSnapshot } from '../../core/context/ContextClassifier';
import type { MoodSnapshot } from '../../core/mood/MoodEngine';
import type { BehaviorSnapshot } from '../../core/behavior/BehaviorEngine';

import { ActivityEngine } from '../../core/activity/ActivityEngine';
import { MultiCompanionRuntime } from '../../core/runtime/MultiCompanionRuntime';

import { CompanionPipelineManager } from '../../core/runtime/CompanionPipelineManager';

import type { CompanionAnimationFsmController } from '../runtime/CompanionAnimationFsmController';
import type { RendererActivityProvider as RendererActivityProviderImpl } from '../activity/RendererActivityProvider';

export class CompanionRuntimeHost {
  private activityEngine = new ActivityEngine();
  private pipelineManager = new CompanionPipelineManager(this.activityEngine);
  private runtime = new MultiCompanionRuntime(this.activityEngine);

  private companion: Companion;

  constructor(private fsm: CompanionAnimationFsmController) {


    this.companion = {
      id: 'default',
      name: 'Default',
      category: 'idle',
      personality: {
        energy: 0.6,
        curiosity: 0.5,
        sleepiness: 0.4,
      },
      voice: {
        packId: 'default',
        voiceId: 'default',
        language: 'en',
      },
      language: {
        packId: 'default',
        languageId: 'en',
      },
      metadata: {},
      animations: { packId: 'default' },
      actions: { packId: 'default' },
      behaviors: { packId: 'default' },
      triggers: { packId: 'default' },
    };

    this.runtime.register(this.companion, {
      onActivity: (_c, activity: ActivitySnapshot, _ctx) => {
        this.fsm.onActivity?.(activity);

        const pipelineState = this.pipelineManager.tick({
          nowMs: Date.now(),
          activity,
          companion: this.companion,
        });

        this.fsm.onMood?.(pipelineState.lastMood as any);
        this.fsm.onBehavior?.(pipelineState.lastBehavior as any);
      },
    });
  }

  async start() {
    await this.runtime.start();
  }

  tick(nowMs: number, provider: RendererActivityProviderImpl) {
    const adapterProvider = () => provider.getSnapshot(nowMs) as any;
    this.runtime.tick(nowMs, adapterProvider);
  }
}


