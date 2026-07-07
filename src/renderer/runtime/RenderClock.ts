export class RenderClock {
  private last = 0;

  tick(now: number) {
    if (!this.last) this.last = now;
    const dt = now - this.last;
    this.last = now;
    return dt;
  }

  reset() {
    this.last = 0;
  }
}

