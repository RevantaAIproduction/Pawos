/**
 * Trimmed animation library for the website's companion preview — only the
 * three clips this preview actually uses, sourced from the same production
 * FBX library as the desktop app (assets/animations/), copied verbatim into
 * public/assets/companion/. Not modified, not regenerated, not duplicated.
 */
export type AnimationName = 'neutral' | 'talking' | 'salute';

export const ANIMATION_FILES: Record<AnimationName, string> = {
  neutral: 'Neutral Idle.fbx',
  talking: 'Talking.fbx',
  salute: 'Salute.fbx',
};

export const ANIMATION_NAMES = Object.keys(ANIMATION_FILES) as AnimationName[];

/** The file whose mesh + skeleton is used as the visible model. */
export const BASE_MESH_ANIMATION: AnimationName = 'neutral';

/** Clips that should loop continuously rather than play once. */
export const LOOPING_ANIMATIONS: ReadonlySet<AnimationName> = new Set<AnimationName>(['neutral', 'talking']);
