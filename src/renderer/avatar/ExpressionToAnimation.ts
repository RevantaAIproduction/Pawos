import type { Expression } from '../companion/emotion/EmotionTypes';
import type { AnimationName } from './AnimationLibrary';

/**
 * Maps the emotion engine's 27-expression vocabulary onto the 21 real FBX
 * clips. Where there's no exact match, the closest real clip is used —
 * same honesty rule as EXPRESSION_TO_CLIP for the 2D renderer.
 */
export const EXPRESSION_TO_ANIMATION_NAME: Record<Expression, AnimationName> = {
  happy: 'happy',
  excited: 'excited',
  curious: 'neutral',
  thinking: 'thinking',
  focused: 'neutral',
  listening: 'happyIdle',
  talking: 'talking',
  confused: 'rejected',
  embarrassed: 'sadIdle',
  shy: 'sadIdle',
  sad: 'sadIdle',
  concerned: 'sadIdle',
  apologetic: 'thankful',
  celebrating: 'cheeringWhileSitting',
  sleepy: 'sadIdle',
  yawning: 'sadIdle',
  stretching: 'standingUp',
  determined: 'salute',
  proud: 'happy',
  playful: 'dropKick',
  laughing: 'sittingLaughing',
  crying: 'sadIdle',
  heartEyes: 'happy',
  angry: 'angry',
  frustrated: 'sittingAngry',
  relieved: 'thankful',
  relaxed: 'happyIdle',
};
