import * as THREE from 'three';

const BREATH_PERIOD_SECONDS = 3.6;
const BREATH_AMPLITUDE_RAD = 0.02;
const SWAY_PERIOD_SECONDS = 5.3;
const SWAY_AMPLITUDE_RAD = 0.015;
const MAX_HEAD_YAW_RAD = 0.28;
const MAX_HEAD_PITCH_RAD = 0.18;
const HEAD_TRACK_SPEED = 4;

function findBone(skeleton: THREE.Skeleton, shortName: string): THREE.Bone | null {
  return skeleton.bones.find((b) => b.name === `mixamorig:${shortName}` || b.name === `mixamorig${shortName}`) ?? null;
}

/**
 * Direct port of the desktop app's ProceduralMotion
 * (src/renderer/avatar/ProceduralMotion.ts) — unchanged. Idle secondary
 * motion layered on top of whatever FBX clip the mixer is currently driving:
 * breathing, a subtle weight shift, and head look-at.
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

  setLookAt(target: { x: number; y: number } | null) {
    this.lookTarget = target ?? { x: 0, y: 0 };
  }

  update(deltaSeconds: number) {
    if (!this.enabled) return;
    this.elapsed += deltaSeconds;

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
