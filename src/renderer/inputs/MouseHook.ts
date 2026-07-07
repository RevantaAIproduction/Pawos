export type MouseHookHandler = (evt: {
  x: number;
  y: number;
  leftDown: boolean;
  rightDown: boolean;
  type: 'move' | 'down' | 'up';
  dx: number;
  dy: number;
  dtMs: number;
}) => void;

export class MouseHook {
  private last = { x: 0, y: 0, t: performance.now() };
  private leftDown = false;
  private rightDown = false;

  private onMove = (e: MouseEvent) => {
    const now = performance.now();
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    const dtMs = Math.max(1, now - this.last.t);

    this.handler({
      type: 'move',
      x: e.clientX,
      y: e.clientY,
      leftDown: this.leftDown,
      rightDown: this.rightDown,
      dx,
      dy,
      dtMs,
    });

    this.last = { x: e.clientX, y: e.clientY, t: now };
  };

  private onDown = (e: MouseEvent) => {
    if (e.button === 0) this.leftDown = true;
    if (e.button === 2) this.rightDown = true;
  };

  private onUp = (e: MouseEvent) => {
    if (e.button === 0) this.leftDown = false;
    if (e.button === 2) this.rightDown = false;
  };

  constructor(private handler: MouseHookHandler) {}

  start() {
    window.addEventListener('mousemove', this.onMove, { passive: true });
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
  }

  stop() {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
  }
}

