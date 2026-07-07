import { Vec2 } from './Vec2';

export type Bounds = { width: number; height: number };

export type PhysicsTuning = {
  gravity: number; // px/s^2
  restitution: number; // 0..1
  linearDrag: number; // 0..1
};

export type Body = {
  position: Vec2;
  velocity: Vec2;
  size: { width: number; height: number };
  onGround?: boolean;
};

export class PhysicsWorld {
  constructor(private tuning: PhysicsTuning) {}

  step(body: Body, bounds: Bounds, dtMs: number) {
    const dt = dtMs / 1000;

    body.velocity.y += this.tuning.gravity * dt;

    // drag
    body.velocity.mul(1 - Math.min(0.99, this.tuning.linearDrag * dt));

    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;

    // edges collision
    const halfW = body.size.width / 2;
    const halfH = body.size.height / 2;

    const minX = halfW;
    const maxX = bounds.width - halfW;
    const minY = halfH;
    const maxY = bounds.height - halfH;

    body.onGround = false;

    if (body.position.x < minX) {
      body.position.x = minX;
      body.velocity.x = -body.velocity.x * this.tuning.restitution;
    } else if (body.position.x > maxX) {
      body.position.x = maxX;
      body.velocity.x = -body.velocity.x * this.tuning.restitution;
    }

    if (body.position.y < minY) {
      body.position.y = minY;
      body.velocity.y = -body.velocity.y * this.tuning.restitution;
    } else if (body.position.y > maxY) {
      body.position.y = maxY;
      body.velocity.y = -body.velocity.y * this.tuning.restitution;
      // treat near-zero bounce as ground contact
      if (Math.abs(body.velocity.y) < 50) {
        body.velocity.y = 0;
        body.onGround = true;
      }
    }
  }
}

