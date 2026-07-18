import * as THREE from 'three';
import type { AnimationName } from './AnimationLibrary';
import { LOOPING_ANIMATIONS } from './AnimationLibrary';
import type { LoadedAvatarAssets } from './AssetManager';

/**
 * Owns the single THREE.AnimationMixer for the companion and one
 * AnimationAction per loaded clip. One mixer, one skeleton, one action per
 * name — nothing here duplicates clips or creates parallel mixers.
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

  /** Speeds up/slows down a clip's own playback (e.g. a "run" is the real walking mocap played faster — not a fabricated clip). */
  setTimeScale(name: AnimationName, rate: number) {
    this.actions.get(name)?.setEffectiveTimeScale(rate);
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
