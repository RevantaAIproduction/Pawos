import * as THREE from 'three';
import { AssetManager } from './AssetManager';
import { AnimationManager } from './AnimationManager';
import { AnimationStateMachine, type AnimationEventListener } from './AnimationStateMachine';
import { BASE_MESH_ANIMATION, type AnimationName } from './AnimationLibrary';
import { ProceduralMotion } from './ProceduralMotion';

/**
 * Website-scoped trim of the desktop app's CompanionAnimationController
 * (src/renderer/avatar/CompanionAnimationController.ts) — same composition
 * of AssetManager + AnimationManager + AnimationStateMachine +
 * ProceduralMotion, minus the face overlay and upload pipeline (neither
 * applies to a scripted, no-AI preview with no voice/lip-sync).
 */
export class CompanionPreviewController {
  private assetManager: AssetManager;
  private animationManager: AnimationManager | null = null;
  private stateMachine: AnimationStateMachine | null = null;
  private proceduralMotion: ProceduralMotion | null = null;
  private _root: THREE.Group | null = null;
  private readonly ready: Promise<void>;

  constructor(baseUrl: string) {
    this.assetManager = new AssetManager(baseUrl);
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const assets = await this.assetManager.loadAll();
    this._root = assets.root;
    this.animationManager = new AnimationManager(assets);
    this.stateMachine = new AnimationStateMachine(this.animationManager, BASE_MESH_ANIMATION);

    let skinnedMesh: THREE.SkinnedMesh | null = null;
    assets.root.traverse((obj) => {
      if (!skinnedMesh && (obj as THREE.SkinnedMesh).isSkinnedMesh) skinnedMesh = obj as THREE.SkinnedMesh;
    });
    if (skinnedMesh) {
      this.proceduralMotion = new ProceduralMotion((skinnedMesh as THREE.SkinnedMesh).skeleton);
    }

    this.stateMachine.play(BASE_MESH_ANIMATION, 0);
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  get root(): THREE.Group | null {
    return this._root;
  }

  play(name: AnimationName, crossFadeMs?: number) {
    this.stateMachine?.play(name, crossFadeMs);
  }

  on(listener: AnimationEventListener): () => void {
    return this.stateMachine?.on(listener) ?? (() => {});
  }

  update(deltaSeconds: number) {
    this.animationManager?.update(deltaSeconds);
    this.proceduralMotion?.update(deltaSeconds);
  }

  dispose() {
    this.stateMachine?.dispose();
    this.animationManager?.dispose();
  }
}
