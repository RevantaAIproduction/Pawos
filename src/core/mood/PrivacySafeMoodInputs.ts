import type { ContextSnapshot } from '../context/ContextClassifier';
import type { CompanionPersonality } from './MoodEngine';

export type MoodInputs = {
  context: ContextSnapshot;
  personality: CompanionPersonality;
  timeOfDay: number;
};

