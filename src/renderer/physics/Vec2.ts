export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  clone() {
    return new Vec2(this.x, this.y);
  }

  add(v: Vec2) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vec2) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mul(s: number) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const len = this.length();
    if (len > 1e-6) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  static fromAngle(radians: number) {
    return new Vec2(Math.cos(radians), Math.sin(radians));
  }
}

