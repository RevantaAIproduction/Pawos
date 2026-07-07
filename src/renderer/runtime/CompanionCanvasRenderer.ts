import type { AnimationPlayer } from '../animations/AnimationPlayer';

export class CompanionCanvasRenderer {
  constructor(private args: { canvas: HTMLCanvasElement }) {}

  render(args: {
    x: number;
    y: number;
    rotation: number;
    size: { width: number; height: number };
    flipX: boolean;
    animation: AnimationPlayer;
  }) {
    const canvas = this.args.canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // transparent background for click-through
    ctx.save();
    ctx.translate(args.x, args.y);
    ctx.rotate(args.rotation);
    if (args.flipX) {
      ctx.scale(-1, 1);
    }
    ctx.translate(0, 0);
    // draw centered (AnimationPlayer handles center)
    args.animation.draw(ctx, 0, 0, args.size, 0);
    ctx.restore();
  }
}

export { CompanionCanvasRenderer as PetCanvasRenderer };

