export type Expression =
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'focused'
  | 'listening'
  | 'talking'
  | 'confused'
  | 'embarrassed'
  | 'shy'
  | 'sad'
  | 'concerned'
  | 'apologetic'
  | 'celebrating'
  | 'sleepy'
  | 'yawning'
  | 'stretching'
  | 'determined'
  | 'proud'
  | 'playful'
  | 'laughing'
  | 'crying'
  | 'heartEyes'
  | 'angry'
  | 'frustrated'
  | 'relieved'
  | 'relaxed';

export type VoiceTone = 'neutral' | 'warm' | 'excited' | 'calm' | 'apologetic' | 'stern' | 'gentle';

export type Posture = 'upright' | 'slouched' | 'energetic' | 'relaxed' | 'guarded';

export type EmotionState = {
  primary: Expression;
  /** Normalized weights for future blend-shape-style mixing; primary always included at 1. */
  blend: Partial<Record<Expression, number>>;
  eyeDirection: { x: number; y: number };
  blinkRateMs: number;
  voiceTone: VoiceTone;
  /** Real today: multiplies CompanionPhysicsController's walk speed. */
  walkSpeedMultiplier: number;
  /**
   * Reserved for a future rig (head/neck/hands/body posture) — the current
   * 2D sprite renderer has no bones to apply this to. Stored and readable
   * via getEmotion() so a future RendererAdapter can consume it immediately.
   */
  posture: Posture;
};

/**
 * The 2D sprite renderer (AnimationPlayer / CompanionAnimationFsm) only has
 * these clips today. Every Expression maps to the closest one until a
 * richer facial rig exists — see RendererAdapter for the future swap point.
 */
export type AnimClip =
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

export const EXPRESSION_TO_CLIP: Record<Expression, AnimClip> = {
  happy: 'happy',
  excited: 'celebrate',
  curious: 'idle',
  thinking: 'typing',
  focused: 'idle',
  listening: 'happy',
  talking: 'happy',
  confused: 'jumping',
  embarrassed: 'idle',
  shy: 'idle',
  sad: 'idle',
  concerned: 'idle',
  apologetic: 'idle',
  celebrating: 'celebrate',
  sleepy: 'sleeping',
  yawning: 'sleeping',
  stretching: 'idle',
  determined: 'idle',
  proud: 'happy',
  playful: 'spinning',
  laughing: 'happy',
  crying: 'idle',
  heartEyes: 'happy',
  angry: 'idle',
  frustrated: 'idle',
  relieved: 'idle',
  relaxed: 'sleeping',
};

/** Walking-speed influence per expression — real, applied to physics today. */
export const EXPRESSION_TO_SPEED: Record<Expression, number> = {
  happy: 1.1,
  excited: 1.4,
  curious: 1.1,
  thinking: 0.9,
  focused: 1,
  listening: 0.9,
  talking: 1,
  confused: 0.9,
  embarrassed: 0.8,
  shy: 0.8,
  sad: 0.7,
  concerned: 0.85,
  apologetic: 0.8,
  celebrating: 1.3,
  sleepy: 0.5,
  yawning: 0.5,
  stretching: 0.6,
  determined: 1.15,
  proud: 1.1,
  playful: 1.3,
  laughing: 1.1,
  crying: 0.6,
  heartEyes: 1,
  angry: 1.1,
  frustrated: 1,
  relieved: 0.9,
  relaxed: 0.6,
};

export const EXPRESSION_TO_POSTURE: Record<Expression, Posture> = {
  happy: 'upright',
  excited: 'energetic',
  curious: 'upright',
  thinking: 'upright',
  focused: 'upright',
  listening: 'upright',
  talking: 'upright',
  confused: 'guarded',
  embarrassed: 'slouched',
  shy: 'slouched',
  sad: 'slouched',
  concerned: 'guarded',
  apologetic: 'slouched',
  celebrating: 'energetic',
  sleepy: 'relaxed',
  yawning: 'relaxed',
  stretching: 'relaxed',
  determined: 'upright',
  proud: 'upright',
  playful: 'energetic',
  laughing: 'energetic',
  crying: 'slouched',
  heartEyes: 'upright',
  angry: 'guarded',
  frustrated: 'guarded',
  relieved: 'relaxed',
  relaxed: 'relaxed',
};
