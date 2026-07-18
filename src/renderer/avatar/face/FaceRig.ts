import * as THREE from 'three';
import type { Expression } from '../../companion/emotion/EmotionTypes';
import type { Viseme } from '../../conversation/LipSyncTypes';

export type FaceArchetype = 'default' | 'happy' | 'excited' | 'sad' | 'angry' | 'sleepy' | 'surprised' | 'thinking';

/** Groups the emotion engine's 27-expression vocabulary into face archetypes — same closest-match rule as EXPRESSION_TO_ANIMATION_NAME. */
export const EXPRESSION_TO_ARCHETYPE: Record<Expression, FaceArchetype> = {
  happy: 'happy',
  excited: 'excited',
  curious: 'default',
  thinking: 'thinking',
  focused: 'default',
  listening: 'default',
  talking: 'default',
  confused: 'surprised',
  embarrassed: 'sad',
  shy: 'sad',
  sad: 'sad',
  concerned: 'sad',
  apologetic: 'sad',
  celebrating: 'excited',
  sleepy: 'sleepy',
  yawning: 'sleepy',
  stretching: 'default',
  determined: 'default',
  proud: 'happy',
  playful: 'happy',
  laughing: 'happy',
  crying: 'sad',
  heartEyes: 'happy',
  angry: 'angry',
  frustrated: 'angry',
  relieved: 'default',
  relaxed: 'default',
};

type MouthShapeName = 'Neutral' | 'Smile' | 'BigSmile' | 'Laugh' | 'Open' | 'Closed' | 'Sad' | 'Surprise';

const VISEME_TO_MOUTH_SHAPE: Record<Viseme, MouthShapeName> = {
  sil: 'Closed',
  PP: 'Closed',
  FF: 'Neutral',
  TH: 'Neutral',
  DD: 'Neutral',
  kk: 'Neutral',
  CH: 'Neutral',
  SS: 'Neutral',
  nn: 'Neutral',
  RR: 'Neutral',
  aa: 'Open',
  E: 'BigSmile',
  ih: 'Neutral',
  oh: 'Surprise',
  ou: 'Surprise',
};

/** Per-archetype eyebrow rotation (radians) and eye squint amount. */
const ARCHETYPE_BROW_TILT: Record<FaceArchetype, { left: number; right: number; squint: number }> = {
  default: { left: 0, right: 0, squint: 0 },
  happy: { left: -0.15, right: 0.15, squint: 0.3 },
  excited: { left: -0.3, right: 0.3, squint: 0 },
  sad: { left: 0.35, right: -0.35, squint: 0.15 },
  angry: { left: 0.4, right: -0.4, squint: 0.35 },
  sleepy: { left: 0.1, right: -0.1, squint: 0.6 },
  surprised: { left: -0.4, right: 0.4, squint: -0.2 },
  thinking: { left: -0.2, right: 0.1, squint: 0.15 },
};

const ARCHETYPE_MOUTH: Record<FaceArchetype, MouthShapeName> = {
  default: 'Neutral',
  happy: 'Smile',
  excited: 'BigSmile',
  sad: 'Sad',
  angry: 'Sad',
  sleepy: 'Neutral',
  surprised: 'Surprise',
  thinking: 'Neutral',
};

const BLINK_DURATION_MS = 130;
const MAX_EYE_YAW = 0.35;
const MAX_EYE_PITCH = 0.22;

function findBone(skeleton: THREE.Skeleton, name: string): THREE.Bone | null {
  return skeleton.bones.find((b) => b.name === name) ?? null;
}

/**
 * Drives the real facial geometry added in Phase 1 (PawOS_LeftEye/RightEye
 * bones, PawOS_LeftEyebrow/RightEyebrow bones, and the PawOS_Jaw-mounted
 * mouth mesh's morph targets) — actual bone rotation and morph-target
 * weights, not a texture overlay. Degrades gracefully (no-ops) for any part
 * that isn't present, e.g. if a future mesh swap drops one of these bones.
 */
export class FaceRig {
  private leftEye: THREE.Bone | null;
  private rightEye: THREE.Bone | null;
  private leftBrow: THREE.Bone | null;
  private rightBrow: THREE.Bone | null;
  private mouthMesh: THREE.Mesh | null;

  private archetype: FaceArchetype = 'default';
  private eyeOffset = { x: 0, y: 0 };
  private mouthShapeOverride: MouthShapeName | null = null;
  private mouthOverrideWeight = 0;

  private blinkRateMs = 4200;
  private blinkTimeSinceLastMs = 0;
  private nextBlinkAtMs: number;
  private blinkActiveMs: number | null = null;

  readonly available: boolean;

  constructor(skeleton: THREE.Skeleton, root: THREE.Object3D) {
    this.leftEye = findBone(skeleton, 'PawOS_LeftEye');
    this.rightEye = findBone(skeleton, 'PawOS_RightEye');
    this.leftBrow = findBone(skeleton, 'PawOS_LeftEyebrow');
    this.rightBrow = findBone(skeleton, 'PawOS_RightEyebrow');

    let mouthMesh: THREE.Mesh | null = null;
    root.traverse((obj) => {
      if (!mouthMesh && obj.name === 'PawOS_MouthMesh') mouthMesh = obj as THREE.Mesh;
    });
    this.mouthMesh = mouthMesh;

    this.available = !!(this.leftEye && this.rightEye && this.mouthMesh);
    this.nextBlinkAtMs = this.rollNextBlinkDelay();
  }

  setExpression(expression: Expression) {
    this.archetype = EXPRESSION_TO_ARCHETYPE[expression];
    this.mouthShapeOverride = null;
  }

  /** Normalized look direction, -1..1 on each axis. */
  setEyeOffset(x: number, y: number) {
    this.eyeOffset = { x, y };
  }

  /** Drives the mouth from a lip-sync viseme frame, taking priority over the archetype's resting mouth shape while weight > 0. */
  setViseme(viseme: Viseme, weight: number) {
    this.mouthShapeOverride = weight > 0.05 ? VISEME_TO_MOUTH_SHAPE[viseme] : null;
    this.mouthOverrideWeight = weight;
  }

  setBlinkRateMs(ms: number) {
    this.blinkRateMs = Math.max(800, ms);
  }

  private rollNextBlinkDelay(): number {
    return this.blinkRateMs * (0.6 + Math.random() * 0.8);
  }

  private setMouthShape(name: MouthShapeName, weight: number) {
    const mesh = this.mouthMesh;
    if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    const index = mesh.morphTargetDictionary[name];
    if (index === undefined) return;
    mesh.morphTargetInfluences.forEach((_, i) => {
      mesh.morphTargetInfluences![i] = i === index ? weight : mesh.morphTargetInfluences![i] * 0.7;
    });
  }

  update(deltaSeconds: number) {
    if (!this.available) return;
    const deltaMs = deltaSeconds * 1000;

    if (this.blinkActiveMs !== null) {
      this.blinkActiveMs += deltaMs;
      if (this.blinkActiveMs >= BLINK_DURATION_MS) {
        this.blinkActiveMs = null;
        this.blinkTimeSinceLastMs = 0;
        this.nextBlinkAtMs = this.rollNextBlinkDelay();
      }
    } else {
      this.blinkTimeSinceLastMs += deltaMs;
      if (this.blinkTimeSinceLastMs >= this.nextBlinkAtMs) {
        this.blinkActiveMs = 0;
      }
    }

    let blinkAmount = 0;
    if (this.blinkActiveMs !== null) {
      const t = this.blinkActiveMs / BLINK_DURATION_MS;
      blinkAmount = t < 0.5 ? t * 2 : (1 - t) * 2;
    }
    const sleepySquint = this.archetype === 'sleepy' ? ARCHETYPE_BROW_TILT.sleepy.squint : 0;
    const eyeCloseAmount = Math.max(blinkAmount, sleepySquint);
    const eyeScaleZ = Math.max(0.06, 1 - eyeCloseAmount);

    const yaw = THREE.MathUtils.clamp(this.eyeOffset.x, -1, 1) * MAX_EYE_YAW;
    const pitch = THREE.MathUtils.clamp(this.eyeOffset.y, -1, 1) * MAX_EYE_PITCH;

    if (this.leftEye) {
      this.leftEye.scale.setZ(eyeScaleZ);
      this.leftEye.rotation.set(pitch, yaw, 0);
    }
    if (this.rightEye) {
      this.rightEye.scale.setZ(eyeScaleZ);
      this.rightEye.rotation.set(pitch, yaw, 0);
    }

    const brows = ARCHETYPE_BROW_TILT[this.archetype];
    if (this.leftBrow) this.leftBrow.rotation.set(0, 0, brows.left);
    if (this.rightBrow) this.rightBrow.rotation.set(0, 0, brows.right);

    if (this.mouthShapeOverride) {
      this.setMouthShape(this.mouthShapeOverride, this.mouthOverrideWeight);
    } else {
      this.setMouthShape(ARCHETYPE_MOUTH[this.archetype], 1);
    }
  }
}
