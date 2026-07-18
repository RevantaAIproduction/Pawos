/**
 * Standard 15-viseme set (Preston Blair / Oculus-style), used as the common
 * target vocabulary regardless of which TTS provider or facial rig is behind
 * it. A future 3D facial rig maps each of these to a blend-shape weight;
 * the current 2D sprite renderer ignores them (no mouth-shape assets exist
 * yet — see AnimationPlayer).
 */
export type Viseme =
  | 'sil'
  | 'PP'
  | 'FF'
  | 'TH'
  | 'DD'
  | 'kk'
  | 'CH'
  | 'SS'
  | 'nn'
  | 'RR'
  | 'aa'
  | 'E'
  | 'ih'
  | 'oh'
  | 'ou';

export type VisemeFrame = {
  timeMs: number;
  viseme: Viseme;
  weight: number;
};
