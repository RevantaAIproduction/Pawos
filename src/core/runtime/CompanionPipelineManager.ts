import type { ActivitySnapshot } from '../activity/ActivityEngine';
import type { Companion } from '../types/CompanionTypes';
import type { ContextSnapshot } from '../context/ContextClassifier';
import type { MoodSnapshot } from '../mood/MoodEngine';
import type { BehaviorSnapshot } from '../behavior/BehaviorEngine';
import { ActivityEngine } from '../activity/ActivityEngine';
import { ContextClassifier } from '../context/ContextClassifier';
import { MoodEngine } from '../mood/MoodEngine';
import { BehaviorEngine } from '../behavior/BehaviorEngine';
import { getLocalTimeOfDayHours } from '../context/TimeUtils';

export type CompanionPipelineState = {
  lastActivity?: ActivitySnapshot;
  lastContext?: ContextSnapshot;
  lastMood?: MoodSnapshot;
  lastBehavior?: BehaviorSnapshot;
};

export type PipelineInputs = {
  nowMs: number;
  activity: ActivitySnapshot;
  companion: Companion;
};

export class CompanionPipelineManager {
  private stateByCompanion = new Map<string, CompanionPipelineState>();

  private contextClassifier = new ContextClassifier();
  private moodEngine = new MoodEngine();
  private behaviorEngine = new BehaviorEngine();

  // ActivityEngine is currently instantiated externally by runtime, but we accept it for completeness
  constructor(private activityEngine?: ActivityEngine) {}

  tick(input: PipelineInputs): CompanionPipelineState {
    const { companion, activity } = input;

    const timeOfDay = getLocalTimeOfDayHours(new Date(input.nowMs));

    const context = this.contextClassifier.classify(activity);

    const mood = this.moodEngine.compute(context, companion.personality as any, timeOfDay);

    const behavior = this.behaviorEngine.suggest({
      context,
      mood: mood.mood,
      idleSeconds: activity.idleSeconds,
      typingSeconds: activity.typingSeconds,
      mouseSeconds: activity.mouseSeconds,
    });

    const prev = this.stateByCompanion.get(companion.id) ?? {};
    const next: CompanionPipelineState = {
      ...prev,
      lastActivity: activity,
      lastContext: context,
      lastMood: mood,
      lastBehavior: behavior,
    };

    this.stateByCompanion.set(companion.id, next);
    return next;
  }
}

