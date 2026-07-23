import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ANIMATION_FILES, ANIMATION_NAMES, BASE_MESH_ANIMATION, type AnimationName } from './AnimationLibrary';

/** Flat matte body color — matches the desktop app's companion (no baked texture, no UV dependency). */
export const BODY_COLOR = '#d9dbdd';

export type LoadedAvatarAssets = {
  /** The visible root object: the bundled Mixamo mesh + skeleton, from the base animation FBX. */
  root: THREE.Group;
  clips: Map<AnimationName, THREE.AnimationClip>;
  failures: Map<AnimationName, Error>;
};

/**
 * Web port of the desktop app's AssetManager (src/renderer/avatar/AssetManager.ts).
 * Same loading strategy — one FBX supplies the base mesh + skeleton, every
 * other FBX only contributes its clip onto that shared skeleton — just
 * resolving URLs against a static public/ base path instead of an Electron
 * IPC-resolved file:// directory.
 */
export class AssetManager {
  private fbxLoader = new FBXLoader();
  private cached: Promise<LoadedAvatarAssets> | null = null;

  constructor(private baseUrl: string) {}

  async loadAll(): Promise<LoadedAvatarAssets> {
    if (!this.cached) {
      this.cached = this.loadAllUncached();
    }
    return this.cached;
  }

  private resolveAnimationUrl(fileName: string): string {
    return `${this.baseUrl}${encodeURIComponent(fileName)}`;
  }

  private async loadFbx(fileName: string): Promise<THREE.Group> {
    const url = this.resolveAnimationUrl(fileName);
    return this.fbxLoader.loadAsync(url);
  }

  private applyBodyColor(group: THREE.Group): void {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(BODY_COLOR),
      roughness: 0.55,
      metalness: 0,
    });
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
    });
  }

  private async loadAllUncached(): Promise<LoadedAvatarAssets> {
    const clips = new Map<AnimationName, THREE.AnimationClip>();
    const failures = new Map<AnimationName, Error>();

    const baseGroup = await this.loadFbx(ANIMATION_FILES[BASE_MESH_ANIMATION]);
    const baseClip = baseGroup.animations[0];
    if (baseClip) clips.set(BASE_MESH_ANIMATION, baseClip);
    else failures.set(BASE_MESH_ANIMATION, new Error('Base FBX has no embedded animation clip.'));

    this.applyBodyColor(baseGroup);

    const remaining = ANIMATION_NAMES.filter((name) => name !== BASE_MESH_ANIMATION);

    await Promise.all(
      remaining.map(async (name) => {
        try {
          const group = await this.loadFbx(ANIMATION_FILES[name]);
          const clip = group.animations[0];
          if (clip) clips.set(name, clip);
          else failures.set(name, new Error(`${ANIMATION_FILES[name]} has no embedded animation clip.`));
        } catch (error) {
          failures.set(name, error instanceof Error ? error : new Error(`Failed to load ${ANIMATION_FILES[name]}.`));
        }
      })
    );

    return { root: baseGroup, clips, failures };
  }
}
