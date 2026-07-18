import type { RendererActivityProvider } from '../activity/RendererActivityProvider';
import type { CompanionAnimationFsmController } from '../runtime/CompanionAnimationFsmController';
import { CompanionRuntimeHost } from './CompanionRuntimeHost';

export function createCompanionRuntimeHostLoop(args: {
  host: CompanionRuntimeHost;
  activityProvider: RendererActivityProvider;
  fsm: CompanionAnimationFsmController;
  tickIntervalMs?: number;
}) {
  const tickIntervalMs = args.tickIntervalMs ?? 250;

  let running = false;
  let last = 0;

  const tick = (now: number) => {
    if (!running) return;
    if (!last) last = now;
    // fixed-ish interval
    try {
      if (now - last >= tickIntervalMs) {
        args.host.tick(Date.now(), args.activityProvider as any);
        last = now;
      }
    } catch (error) {
      // One bad tick should never permanently stall this loop (it drives
      // mood/behavior that the visible 3D avatar's idle expression reads
      // from) — log and keep going instead of freezing forever.
      console.error('[CompanionRuntimeHostLoop] tick failed, continuing', error);
    } finally {
      requestAnimationFrame(tick);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    },
    stop() {
      running = false;
    },
  };
}

