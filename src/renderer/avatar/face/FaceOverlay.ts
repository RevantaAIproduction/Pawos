import * as THREE from 'three';
import type { Expression } from '../../companion/emotion/EmotionTypes';
import type { Viseme } from '../../conversation/LipSyncTypes';

type FaceArchetype = 'default' | 'happy' | 'excited' | 'sad' | 'angry' | 'sleepy' | 'surprised' | 'thinking';

/** Groups the emotion engine's 27-expression vocabulary into face archetypes — closest-match rule, same as EXPRESSION_TO_ANIMATION_NAME. */
const EXPRESSION_TO_ARCHETYPE: Record<Expression, FaceArchetype> = {
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

type MouthShape = 'closed' | 'small' | 'wide' | 'round';

const VISEME_TO_MOUTH_SHAPE: Record<Viseme, MouthShape> = {
  sil: 'closed',
  PP: 'closed',
  FF: 'small',
  TH: 'small',
  DD: 'small',
  kk: 'small',
  CH: 'small',
  SS: 'small',
  nn: 'small',
  RR: 'small',
  aa: 'wide',
  E: 'wide',
  ih: 'small',
  oh: 'round',
  ou: 'round',
};

const CANVAS_SIZE = 256;
const GLOW_COLOR = '#5fd9ff';
const BLINK_DURATION_MS = 130;

/** How far above/in front of the Head bone the face plane sits, and how big it is — in the same world units as the character (~1.7–1.9 tall). Tuned empirically for this rig. */
const UP_OFFSET = 0.12;
const FORWARD_OFFSET = 0.25;
const PLANE_WIDTH = 0.16;
const PLANE_HEIGHT = 0.12;

/**
 * A small transparent quad, parented in world space (not scene-graph) to
 * float just in front of the Head bone, showing live-drawn glowing eyes/
 * eyebrows/mouth. Deliberately NOT painted onto the body mesh's own UVs —
 * this mesh's UV layout doesn't correspond to any texture we have, and
 * guessing at it produced visibly broken results. A separate billboard
 * plane sidesteps that entirely: no UV dependency, no custom export
 * pipeline, pure runtime three.js.
 */
export class FaceOverlay {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private headBone: THREE.Bone;
  private root: THREE.Object3D;

  private archetype: FaceArchetype = 'default';
  private eyeOffset = { x: 0, y: 0 };
  private mouthShapeOverride: MouthShape | null = null;
  private mouthOverrideWeight = 0;

  private blinkRateMs = 4200;
  private blinkTimeSinceLastMs = 0;
  private nextBlinkAtMs: number;
  private blinkActiveMs: number | null = null;

  constructor(headBone: THREE.Bone, root: THREE.Object3D) {
    this.headBone = headBone;
    this.root = root;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;

    this.nextBlinkAtMs = this.rollNextBlinkDelay();
    this.draw(0);
  }

  setExpression(expression: Expression) {
    this.archetype = EXPRESSION_TO_ARCHETYPE[expression];
    this.mouthShapeOverride = null;
  }

  setEyeOffset(x: number, y: number) {
    this.eyeOffset = { x, y };
  }

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

  update(deltaSeconds: number, camera?: THREE.Camera) {
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

    this.draw(blinkAmount);
    this.texture.needsUpdate = true;
    this.positionPlane(camera);
  }

  private positionPlane(camera?: THREE.Camera) {
    const headWorldPos = new THREE.Vector3();
    this.headBone.getWorldPosition(headWorldPos);

    const rootQuat = new THREE.Quaternion();
    this.root.getWorldQuaternion(rootQuat);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQuat);

    this.mesh.position.copy(headWorldPos).addScaledVector(up, UP_OFFSET).addScaledVector(forward, FORWARD_OFFSET);

    if (camera) {
      this.mesh.quaternion.copy(camera.quaternion);
    } else {
      this.mesh.quaternion.copy(rootQuat);
    }
  }

  private draw(blinkAmount: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE * 0.5;
    const eyeSpacing = CANVAS_SIZE * 0.2;
    const eyeSize = CANVAS_SIZE * 0.14;

    const maxOffsetX = eyeSize * 0.35;
    const maxOffsetY = eyeSize * 0.25;
    const offsetX = clamp(this.eyeOffset.x, -1, 1) * maxOffsetX;
    const offsetY = clamp(this.eyeOffset.y, -1, 1) * maxOffsetY;

    ctx.strokeStyle = GLOW_COLOR;
    ctx.fillStyle = GLOW_COLOR;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = GLOW_COLOR;
    ctx.shadowBlur = eyeSize * 0.7;

    const sleepySquint = this.archetype === 'sleepy' ? 0.6 : 0;
    const closeAmount = Math.max(blinkAmount, sleepySquint);
    const openAmount = clamp(1 - closeAmount, 0, 1);

    const leftX = centerX - eyeSpacing + offsetX;
    const rightX = centerX + eyeSpacing + offsetX;
    const eyeY = centerY + offsetY;

    this.drawEyebrow(leftX, eyeY - eyeSize * 1.3, eyeSize, 'left');
    this.drawEyebrow(rightX, eyeY - eyeSize * 1.3, eyeSize, 'right');

    this.drawEye(leftX, eyeY, eyeSize, openAmount, 'left');
    this.drawEye(rightX, eyeY, eyeSize, openAmount, 'right');

    const mouthShape = this.mouthShapeOverride ?? this.archetypeMouthShape();
    const mouthWeight = this.mouthShapeOverride ? this.mouthOverrideWeight : 1;
    this.drawMouth(centerX, centerY + eyeSize * 1.8, eyeSize, mouthShape, mouthWeight);
  }

  private archetypeMouthShape(): MouthShape {
    switch (this.archetype) {
      case 'happy':
      case 'excited':
        return 'wide';
      case 'surprised':
        return 'round';
      default:
        return 'closed';
    }
  }

  private drawEyebrow(cx: number, cy: number, size: number, side: 'left' | 'right') {
    const tilts: Record<FaceArchetype, number> = {
      default: 0,
      happy: side === 'left' ? -0.15 : 0.15,
      excited: side === 'left' ? -0.3 : 0.3,
      sad: side === 'left' ? 0.35 : -0.35,
      angry: side === 'left' ? 0.4 : -0.4,
      sleepy: side === 'left' ? 0.1 : -0.1,
      surprised: side === 'left' ? -0.4 : 0.4,
      thinking: side === 'left' ? -0.2 : 0.1,
    };
    const tilt = tilts[this.archetype];
    const halfLen = size * 0.55;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(tilt);
    this.ctx.lineWidth = Math.max(2, size * 0.16);
    this.ctx.beginPath();
    this.ctx.moveTo(-halfLen, 0);
    this.ctx.lineTo(halfLen, 0);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawEye(cx: number, cy: number, size: number, openAmount: number, side: 'left' | 'right') {
    const ctx = this.ctx;
    const lw = Math.max(2, size * 0.22);
    ctx.lineWidth = lw;

    if (openAmount < 0.12) {
      const half = size * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy);
      ctx.lineTo(cx + half, cy);
      ctx.stroke();
      return;
    }

    const h = size * openAmount;

    switch (this.archetype) {
      case 'happy':
        ctx.beginPath();
        ctx.arc(cx, cy + h * 0.4, size * 0.6, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        break;
      case 'excited':
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.5 * openAmount + size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'sad':
        ctx.beginPath();
        ctx.arc(cx, cy - h * 0.2, size * 0.55, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'angry': {
        const dir = side === 'left' ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.5, cy - dir * size * 0.25);
        ctx.lineTo(cx + size * 0.5, cy + dir * size * 0.25);
        ctx.stroke();
        break;
      }
      case 'surprised':
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.45 * openAmount + size * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'thinking':
        if (side === 'left') {
          ctx.beginPath();
          ctx.arc(cx, cy + h * 0.3, size * 0.55, Math.PI * 1.2, Math.PI * 1.8);
          ctx.stroke();
        } else {
          const half = size * 0.45;
          ctx.beginPath();
          ctx.moveTo(cx - half, cy);
          ctx.lineTo(cx + half, cy);
          ctx.stroke();
        }
        break;
      default:
        ctx.beginPath();
        ctx.arc(cx, cy + h * 0.35, size * 0.5, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        break;
    }
  }

  private drawMouth(cx: number, cy: number, eyeSize: number, shape: MouthShape, weight: number) {
    const ctx = this.ctx;
    const lw = Math.max(1.5, eyeSize * 0.16);
    ctx.lineWidth = lw;
    ctx.shadowBlur = eyeSize * 0.5;
    const width = eyeSize * 1.1;

    if (shape === 'wide' && weight > 0.05) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.5, eyeSize * 0.35 * weight + eyeSize * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (shape === 'round' && weight > 0.05) {
      const r = eyeSize * 0.28 * weight + eyeSize * 0.06;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (shape === 'small' && weight > 0.05) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.32, eyeSize * 0.18 * weight + eyeSize * 0.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    if (this.archetype === 'sad' || this.archetype === 'angry') {
      ctx.arc(cx, cy + eyeSize * 0.3, width * 0.45, Math.PI * 1.2, Math.PI * 1.8);
    } else if (this.archetype === 'happy' || this.archetype === 'excited') {
      ctx.arc(cx, cy - eyeSize * 0.05, width * 0.45, Math.PI * 0.15, Math.PI * 0.85);
    } else {
      ctx.moveTo(cx - width * 0.35, cy);
      ctx.lineTo(cx + width * 0.35, cy);
    }
    ctx.stroke();
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
