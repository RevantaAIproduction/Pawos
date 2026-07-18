import * as THREE from 'three';

const TURN_SPEED = Math.PI / 0.7; // matches AnimationController's walk-turn feel

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Smoothly turns a root Object3D's yaw to face wherever the cursor is
 * around it — the cursor's angle relative to the view center maps
 * directly to facing direction, so tracing a full circle with the cursor
 * sweeps the body through a full 360°, not just a subtle head tilt (see
 * ProceduralMotion's head look-at, which stays — this is additive, for the
 * body). Used standalone by the Avatar Lab previews (no CompanionRuntime
 * there); the live overlay gets the same behavior via
 * AnimationController.setCursorLookYaw, which uses this same math.
 */
export class BodyLookYaw {
  private current = 0;
  private target: number | null = null;

  /** angle in radians, 0 = facing the camera; null = recenter to facing forward. */
  setTarget(angle: number | null) {
    this.target = angle;
  }

  update(deltaSeconds: number, root: THREE.Object3D | null) {
    if (!root) return;
    const goal = this.target ?? 0;
    const delta = shortestAngleDelta(this.current, goal);
    const maxStep = TURN_SPEED * deltaSeconds;
    this.current += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
    root.rotation.y = this.current;
  }
}

/** Cursor position relative to an element's center, as a facing-yaw angle — trace a circle with the cursor and this sweeps a full 360°. */
export function cursorAngleFromCenter(clientX: number, clientY: number, rect: DOMRect): number {
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  return Math.atan2(dx, -dy);
}
