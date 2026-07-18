import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ANIMATION_FILES, ANIMATION_NAMES, BASE_MESH_ANIMATION, type AnimationName } from './AnimationLibrary';

/** Flat matte body color — no baked photo texture, no UV dependency, just this uniform tone (clay/3D-print look). */
export const BODY_COLOR = '#d9dbdd';

export type LoadedAvatarAssets = {
  /** The visible root object: the bundled Mixamo mesh + skeleton, from the base animation FBX. */
  root: THREE.Group;
  /** Every clip, including the base one, keyed by canonical name. */
  clips: Map<AnimationName, THREE.AnimationClip>;
  /** Names that failed to load, with their error — reported, never silently dropped. */
  failures: Map<AnimationName, Error>;
};

/**
 * Loads the existing FBX animation library (assets/animations/) and caches
 * the result. Does not modify, regenerate, or duplicate any FBX file. The
 * base mesh + skeleton come from one file (BASE_MESH_ANIMATION); every other
 * FBX only contributes its clip, applied to that same shared Mixamo
 * skeleton. The visible character is the bundled mesh exactly as it ships in
 * that file — only its material is swapped for a flat matte color (no photo
 * texture: this mesh's own UV layout doesn't match any texture file we have,
 * and guessing at it previously produced visibly broken results). Eyes/
 * eyebrows/mouth are a separate floating overlay — see face/FaceOverlay.ts —
 * not painted onto this mesh at all.
 *
 * A Phase-1 character build (new eye/eyebrow/mouth bones + geometry + blend
 * shapes + PBR materials, exported as assets/characters/character_pawos.glb
 * — see scripts/build_pawos_character.py) exists on disk but is NOT wired in
 * here: it renders as fully invisible in the live three.js runtime (0 JS
 * exceptions, confirmed even with the camera zoomed far out), most likely a
 * bind-pose/skinning-matrix issue from how the new bones were added in
 * Blender. Left unresolved rather than shipped broken or faked as working.
 */
export class AssetManager {
  private fbxLoader = new FBXLoader();
  private animationsBaseUrl: string | null = null;
  private cached: Promise<LoadedAvatarAssets> | null = null;

  constructor(
    private getAnimationsBaseUrl: () => Promise<string>,
    // Retained for API compatibility with callers that still resolve a characters base URL; unused now that no custom character mesh is loaded.
    private getCharactersBaseUrl: () => Promise<string>
  ) {}

  async loadAll(): Promise<LoadedAvatarAssets> {
    if (!this.cached) {
      this.cached = this.loadAllUncached();
    }
    return this.cached;
  }

  private async resolveAnimationUrl(fileName: string): Promise<string> {
    if (!this.animationsBaseUrl) {
      this.animationsBaseUrl = await this.getAnimationsBaseUrl();
    }
    return `${this.animationsBaseUrl}${encodeURIComponent(fileName)}`;
  }

  private async loadFbx(fileName: string): Promise<THREE.Group> {
    const url = await this.resolveAnimationUrl(fileName);
    return this.fbxLoader.loadAsync(url);
  }

  /** Flat matte PBR material — no texture, so no UV-alignment risk regardless of this mesh's own UV layout. */
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
