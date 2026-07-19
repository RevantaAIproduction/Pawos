import * as THREE from 'three';
import { AssetManager } from './AssetManager';
import { AnimationManager } from './AnimationManager';
import { AnimationStateMachine, type AnimationEventListener } from './AnimationStateMachine';
import { BASE_MESH_ANIMATION, type AnimationName } from './AnimationLibrary';
import { ProceduralMotion } from './ProceduralMotion';
import { FaceOverlay } from './face/FaceOverlay';
import { autoRigMeshToSkeleton } from './AutoRigger';
import { loadUploadedCompanionFile, detectRig } from './CompanionUploadPipeline';
import type { Expression } from '../companion/emotion/EmotionTypes';
import type { Viseme } from '../conversation/LipSyncTypes';

/**
 * The public API for driving the companion's 3D animation library:
 *   controller.play('happy')
 *   controller.play('thinking')
 *   controller.play('typing')
 *   controller.play('talking')
 *   controller.play('walking')
 *   controller.queue('thankful')
 *   controller.stop()
 *   controller.crossFade('neutral')
 *
 * One AssetManager, one AnimationManager (one mixer, one skeleton), one
 * AnimationStateMachine — this class only composes them and exposes the
 * documented surface, plus procedural idle motion and a floating face
 * overlay (see face/FaceOverlay.ts). The overlay is a separate mesh, not a
 * child of `root` — callers must add `faceOverlayMesh` to their own scene
 * once ready, alongside `root`.
 *
 * The state machine only exists once loading finishes (initialize() is
 * async), so any command or `on()` subscription issued before that is
 * buffered here and replayed once it's ready — callers don't need to know
 * or wait for load completion themselves.
 */
export class CompanionAnimationController {
  private assetManager: AssetManager;
  private animationManager: AnimationManager | null = null;
  private stateMachine: AnimationStateMachine | null = null;
  private _root: THREE.Group | null = null;
  private failures = new Map<AnimationName, Error>();
  private readonly ready: Promise<void>;
  private pendingCommands: (() => void)[] = [];
  private pendingListeners = new Set<AnimationEventListener>();
  private proceduralMotion: ProceduralMotion | null = null;
  private faceOverlay: FaceOverlay | null = null;

  constructor(getAnimationsBaseUrl: () => Promise<string>, getCharactersBaseUrl: () => Promise<string>) {
    this.assetManager = new AssetManager(getAnimationsBaseUrl, getCharactersBaseUrl);
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const assets = await this.assetManager.loadAll();
    this._root = assets.root;
    this.failures = assets.failures;
    this.animationManager = new AnimationManager(assets);
    this.stateMachine = new AnimationStateMachine(this.animationManager, BASE_MESH_ANIMATION);

    let skinnedMesh: THREE.SkinnedMesh | null = null;
    assets.root.traverse((obj) => {
      if (!skinnedMesh && (obj as THREE.SkinnedMesh).isSkinnedMesh) skinnedMesh = obj as THREE.SkinnedMesh;
    });
    if (skinnedMesh) {
      const skeleton = (skinnedMesh as THREE.SkinnedMesh).skeleton;
      this.proceduralMotion = new ProceduralMotion(skeleton);

      // This loader strips the colon from Mixamo bone names ("mixamorigHead", not "mixamorig:Head") — accept either.
      const headBone = skeleton.bones.find((b) => b.name === 'mixamorig:Head' || b.name === 'mixamorigHead');
      if (headBone) {
        this.faceOverlay = new FaceOverlay(headBone, assets.root);
      }
    }

    for (const listener of this.pendingListeners) {
      this.stateMachine.on(listener);
    }
    this.pendingListeners.clear();

    this.stateMachine.play(BASE_MESH_ANIMATION, 0);

    for (const command of this.pendingCommands) {
      command();
    }
    this.pendingCommands = [];
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  get root(): THREE.Group | null {
    return this._root;
  }

  /** The floating face overlay mesh — add this to your scene alongside `root` once whenReady() resolves. Null if the mesh has no Head bone to anchor it to. */
  get faceOverlayMesh(): THREE.Object3D | null {
    return this.faceOverlay?.mesh ?? null;
  }

  /** Names that failed to load, with their error — never silently swallowed. */
  getLoadFailures(): Map<AnimationName, Error> {
    return this.failures;
  }

  getAvailableAnimations(): AnimationName[] {
    return this.animationManager?.availableNames() ?? [];
  }

  getCurrent(): AnimationName | null {
    return this.stateMachine?.getCurrent() ?? null;
  }

  getQueue(): AnimationName[] {
    return this.stateMachine?.getQueue() ?? [];
  }

  play(name: AnimationName, crossFadeMs?: number) {
    if (this.stateMachine) this.stateMachine.play(name, crossFadeMs);
    else this.pendingCommands.push(() => this.stateMachine?.play(name, crossFadeMs));
  }

  queue(name: AnimationName) {
    if (this.stateMachine) this.stateMachine.queueAnimation(name);
    else this.pendingCommands.push(() => this.stateMachine?.queueAnimation(name));
  }

  stop() {
    if (this.stateMachine) this.stateMachine.stop();
    else this.pendingCommands.push(() => this.stateMachine?.stop());
  }

  crossFade(name: AnimationName, durationMs?: number) {
    if (this.stateMachine) this.stateMachine.crossFade(name, durationMs);
    else this.pendingCommands.push(() => this.stateMachine?.crossFade(name, durationMs));
  }

  /** Subscribes to start/end events. Safe to call before assets finish loading. */
  on(listener: AnimationEventListener): () => void {
    if (this.stateMachine) {
      return this.stateMachine.on(listener);
    }
    this.pendingListeners.add(listener);
    return () => this.pendingListeners.delete(listener);
  }

  /** Sets the face's expression archetype. Safe before assets finish loading. */
  setExpression(expression: Expression) {
    if (this.faceOverlay) this.faceOverlay.setExpression(expression);
    else this.pendingCommands.push(() => this.faceOverlay?.setExpression(expression));
  }

  /** Normalized look direction (-1..1 per axis) for both the eyes and the procedural head turn; null recenters. */
  setLookAt(target: { x: number; y: number } | null) {
    const apply = () => {
      this.faceOverlay?.setEyeOffset(target?.x ?? 0, target?.y ?? 0);
      this.proceduralMotion?.setLookAt(target);
    };
    if (this.faceOverlay || this.proceduralMotion) apply();
    else this.pendingCommands.push(apply);
  }

  /** Drives the mouth shape from a lip-sync viseme frame; weight is 0..1 (silence/low weight reads as a closed mouth). */
  setViseme(viseme: Viseme, weight: number) {
    if (this.faceOverlay) this.faceOverlay.setViseme(viseme, weight);
    else this.pendingCommands.push(() => this.faceOverlay?.setViseme(viseme, weight));
  }

  setBlinkRateMs(ms: number) {
    if (this.faceOverlay) this.faceOverlay.setBlinkRateMs(ms);
    else this.pendingCommands.push(() => this.faceOverlay?.setBlinkRateMs(ms));
  }

  /** Speeds up/slows down a clip's playback — e.g. a "run" is the real `walking` mocap played at a higher rate, not a fabricated clip. 1.0 = normal speed. */
  setPlaybackRate(name: AnimationName, rate: number) {
    if (this.animationManager) this.animationManager.setTimeScale(name, rate);
    else this.pendingCommands.push(() => this.animationManager?.setTimeScale(name, rate));
  }

  /** `camera` is optional — pass it so the face overlay billboards toward the actual viewing angle (important wherever the camera can move, e.g. an orbit-controlled preview). */
  update(deltaSeconds: number, camera?: THREE.Camera) {
    this.animationManager?.update(deltaSeconds);
    this.proceduralMotion?.update(deltaSeconds);
    this.faceOverlay?.update(deltaSeconds, camera);
  }

  /**
   * Upload Existing Companion pipeline's terminal step: validate -> detect
   * rig -> (rigged: import as-is) / (not rigged: auto-rig onto our own
   * shared skeleton) -> Companion Runtime. Reuses every existing system
   * (expressions/lip-sync/physics/animations) unchanged — they're already
   * generic over "whatever skeleton this controller is driving," not
   * specific to the bundled mesh.
   *
   * Honest limitation for the "already rigged" branch: our animation clips
   * target Mixamo bone names. If the uploaded rig uses different names,
   * three.js's AnimationMixer silently skips the non-matching tracks
   * (never throws) rather than animating it — no bone retargeting is
   * attempted here. The auto-rig branch has no such limitation since it
   * binds directly onto our own skeleton.
   */
  async loadUploadedCompanion(filePath: string): Promise<{ rigged: boolean }> {
    await this.ready;
    if (!this._root) throw new Error('Base companion assets have not finished loading yet.');

    let referenceMesh: THREE.SkinnedMesh | null = null;
    this._root.traverse((obj) => {
      if (!referenceMesh && (obj as THREE.SkinnedMesh).isSkinnedMesh) referenceMesh = obj as THREE.SkinnedMesh;
    });
    if (!referenceMesh) throw new Error('No reference skeleton available to bind the uploaded model to.');
    const skeleton = (referenceMesh as THREE.SkinnedMesh).skeleton;
    const parent = (referenceMesh as THREE.SkinnedMesh).parent;

    const uploadedGroup = await loadUploadedCompanionFile(filePath);
    const { rigged } = detectRig(uploadedGroup);

    parent?.remove(referenceMesh);
    (referenceMesh as THREE.SkinnedMesh).geometry.dispose();

    if (rigged) {
      // Self-contained: brings its own bone hierarchy along with the mesh.
      this._root.add(uploadedGroup);
    } else {
      const rig = autoRigMeshToSkeleton(uploadedGroup, skeleton, referenceMesh);
      parent?.add(rig);
    }

    return { rigged };
  }

  dispose() {
    this.pendingCommands = [];
    this.pendingListeners.clear();
    this.stateMachine?.dispose();
    this.animationManager?.dispose();
    this.faceOverlay?.dispose();
  }
}
