import type { AnimClip, EmotionState, Expression } from './emotion/EmotionTypes';

/**
 * The contract between the companion engine (brain + providers) and
 * whatever actually draws the companion on screen. CompanionApp is the
 * concrete implementation today, backed by the 2D canvas sprite system
 * (AnimationPlayer + CompanionCanvasRenderer) — no 3D rendering library,
 * 3D model, skeleton, or facial rig exists in this project yet.
 *
 * A future 3D avatar system (FBX or OBJ model + skeleton + blend-shape
 * facial rig — not GLB) would implement this exact same interface — e.g.
 * `Fbx3DRendererAdapter` using three.js + FBXLoader/OBJLoader — and nothing
 * above this layer (brain, providers, IPC command surface, React hooks)
 * would need to change. `setEmotion`/`lookAt` would then drive real
 * blend-shape weights and bone rotations instead of picking a 2D sprite clip.
 */
export interface RendererAdapter {
  setEmotion(expression: Expression): void;
  playAnimation(clip: AnimClip): void;
  lookAt(target: { x: number; y: number } | null): void;
  getEmotion(): EmotionState | undefined;
}
