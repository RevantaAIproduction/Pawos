import * as THREE from 'three';
import type { AnimationName } from './AnimationLibrary';
import { LOOPING_ANIMATIONS } from './AnimationLibrary';
import type { LoadedAvatarAssets } from './AssetManager';

/**
 * Direct port of the desktop app's AnimationManager (src/renderer/avatar/AnimationManager.ts) — unchanged.
 * Owns the single THREE.AnimationMixer for the companion and one
 * AnimationAction per loaded clip.
 */
export class AnimationManager {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<AnimationName, THREE.AnimationAction>();

  constructor(assets: LoadedAvatarAssets) {
    this.mixer = new THREE.AnimationMixer(assets.root);

    for (const [name, clip] of assets.clips) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(LOOPING_ANIMATIONS.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !LOOPING_ANIMATIONS.has(name);
      this.actions.set(name, action);
    }
  }

  getAction(name: AnimationName): THREE.AnimationAction | undefined {
    return this.actions.get(name);
  }

  getNameForAction(action: THREE.AnimationAction): AnimationName | undefined {
    for (const [name, a] of this.actions) {
      if (a === action) return name;
    }
    return undefined;
  }

  hasAction(name: AnimationName): boolean {
    return this.actions.has(name);
  }

  availableNames(): AnimationName[] {
    return [...this.actions.keys()];
  }

  update(deltaSeconds: number) {
    this.mixer.update(deltaSeconds);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.actions.clear();
  }
}
