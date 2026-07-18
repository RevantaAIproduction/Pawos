import * as THREE from 'three';

const BREATH_PERIOD_SECONDS = 3.6;
const BREATH_AMPLITUDE_RAD = 0.02;
const SWAY_PERIOD_SECONDS = 5.3;
const SWAY_AMPLITUDE_RAD = 0.015;
const MAX_HEAD_YAW_RAD = 0.28;
const MAX_HEAD_PITCH_RAD = 0.18;
const HEAD_TRACK_SPEED = 4;

/**
 * Different FBX loaders/exports disagree on whether the "mixamorig:" prefix
 * keeps its colon (three.js's FBXLoader strips it: "mixamorigHead", not
 * "mixamorig:Head") — accept either so this doesn't silently no-op again if
 * the mesh source ever changes.
 */
function findBone(skeleton: THREE.Skeleton, shortName: string): THREE.Bone | null {
  return skeleton.bones.find((b) => b.name === `mixamorig:${shortName}` || b.name === `mixamorig${shortName}`) ?? null;
}

/**
 * Idle secondary motion layered additively on top of whatever FBX clip the
 * AnimationMixer is currently driving — breathing, a subtle idle weight
 * shift, and head look-at toward a target (cursor, or centered when null).
 * Runs after AnimationManager.update() each frame so it composes with the
 * mixer's pose rather than fighting it; never touches clip data, the
 * skeleton's bind pose, or any FBX file.
 */
export class ProceduralMotion {
  private spineBone: THREE.Bone | null;
  private hipsBone: THREE.Bone | null;
  private headBone: THREE.Bone | null;

  private elapsed = 0;
  private lookTarget: { x: number; y: number } = { x: 0, y: 0 };
  private currentHeadYaw = 0;
  private currentHeadPitch = 0;
  private enabled = true;

  constructor(skeleton: THREE.Skeleton) {
    this.spineBone = findBone(skeleton, 'Spine1') ?? findBone(skeleton, 'Spine');
    this.hipsBone = findBone(skeleton, 'Hips');
    this.headBone = findBone(skeleton, 'Head');
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /** Normalized look direction, -1..1 on each axis; null recenters the head. */
  setLookAt(target: { x: number; y: number } | null) {
    this.lookTarget = target ?? { x: 0, y: 0 };
  }

  update(deltaSeconds: number) {
    if (!this.enabled) return;
    this.elapsed += deltaSeconds;

    // Each of these is an absolute angular offset applied on top of whatever
    // pose the AnimationMixer already wrote to the bone THIS frame — the
    // mixer re-authors every bone's local rotation every frame from the
    // clip, so there is nothing to "reset": next frame starts fresh from
    // the clip again, and this nudges it once, again, freshly.
    if (this.spineBone) {
      const breath = Math.sin((this.elapsed / BREATH_PERIOD_SECONDS) * Math.PI * 2) * BREATH_AMPLITUDE_RAD;
      this.spineBone.rotateX(breath);
    }

    if (this.hipsBone) {
      const sway = Math.sin((this.elapsed / SWAY_PERIOD_SECONDS) * Math.PI * 2) * SWAY_AMPLITUDE_RAD;
      this.hipsBone.rotateZ(sway);
    }

    if (this.headBone) {
      const targetYaw = -this.lookTarget.x * MAX_HEAD_YAW_RAD;
      const targetPitch = this.lookTarget.y * MAX_HEAD_PITCH_RAD;
      const t = Math.min(1, deltaSeconds * HEAD_TRACK_SPEED);
      this.currentHeadYaw += (targetYaw - this.currentHeadYaw) * t;
      this.currentHeadPitch += (targetPitch - this.currentHeadPitch) * t;
      this.headBone.rotateY(this.currentHeadYaw);
      this.headBone.rotateX(this.currentHeadPitch);
    }
  }
}
