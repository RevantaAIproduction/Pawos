import type { CompanionDefinition } from '../companion/CompanionDefinition';
import type { CompanionRuntime } from './CompanionRuntimeTypes';

export type CompanionPhysicsSettings = {
  animationSpeed: number;
};

export class CompanionPhysicsController {
  private x: number;
  private y: number;
  private rotation = 0;
  private flipX = false;

  private vx = 0;
  private vy = 0;

  private target?: { x: number; y: number };
  private state: 'idle' | 'moving' = 'idle';

  private gravity = 1200; // px/s^2
  private restitution = 0.65;
  private linearDrag = 2.5; // higher => more damp

  private inputActive = false;
  private emotionSpeedMultiplier = 1;

  private size: { width: number; height: number };

  constructor(private args: { pet: CompanionDefinition; initial: CompanionRuntime; settings: any }) {
    this.x = args.initial.x;
    this.y = args.initial.y;
    this.size = { ...args.pet.bodySize };
    this.restitution = args.pet.physics.restitution;
    this.gravity = 1200;
    this.linearDrag = 2.3;
  }

  update(dtMs: number, bounds: { width: number; height: number }) {
    const dt = dtMs / 1000;

    // natural target movement when idle
    if (!this.inputActive) {
      if (!this.target || this.state === 'idle') {
        // pick new target occasionally
        if (!this.target) {
          this.target = this.randomTarget(bounds);
          this.state = 'moving';
        } else {
          const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
          if (dist < 8) {
            this.target = this.randomTarget(bounds);
            this.state = 'moving';
          }
        }
      }
    }

    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);

      const speed =
        (this.args.pet.physics.speed ?? 160) * (this.args.settings.animationSpeed ?? 1) * this.emotionSpeedMultiplier;
      const move = Math.min(dist, speed * dt);
      if (dist > 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.vx = nx * (move / dt);
        this.vy = ny * (move / dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.flipX = nx < 0;
        this.rotation = Math.atan2(this.vy, this.vx) * 0.15;
      }

      if (dist < 10) this.state = 'idle';
    } else {
      // gravity settle
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // edge collision
    const halfW = this.size.width / 2;
    const halfH = this.size.height / 2;
    const minX = halfW;
    const maxX = bounds.width - halfW;
    const minY = halfH;
    const maxY = bounds.height - halfH;

    if (this.x < minX) {
      this.x = minX;
      this.vx = -this.vx * this.restitution;
    } else if (this.x > maxX) {
      this.x = maxX;
      this.vx = -this.vx * this.restitution;
    }

    if (this.y < minY) {
      this.y = minY;
      this.vy = -this.vy * this.restitution;
    } else if (this.y > maxY) {
      this.y = maxY;
      this.vy = -this.vy * this.restitution;
      if (Math.abs(this.vy) < 80) this.vy = 0;
    }

    // soft drag
    const dragK = Math.exp(-this.linearDrag * dt);
    this.vx *= dragK;
    this.vy *= dragK;

    // idle target should chase mouse quickly
    this.inputActive = false;
  }

  private randomTarget(bounds: { width: number; height: number }) {
    const margin = 40;
    const x = margin + Math.random() * (bounds.width - margin * 2);
    const y = margin + Math.random() * (bounds.height - margin * 2);
    return { x, y };
  }

  getX() {
    return this.x;
  }
  getY() {
    return this.y;
  }
  getRotation() {
    return this.rotation;
  }
  getFlipX() {
    return this.flipX;
  }
  getSize() {
    return this.size;
  }

  setInputActive(v: boolean) {
    this.inputActive = v;
  }

  /** Emotion-driven walking-speed influence (e.g. sleepy = slower, excited = faster). */
  setSpeedMultiplier(multiplier: number) {
    this.emotionSpeedMultiplier = multiplier;
  }

  setTarget(x: number, y: number) {
    this.target = { x, y };
    this.state = 'moving';
  }
}

export { CompanionPhysicsController as PetPhysicsController };

