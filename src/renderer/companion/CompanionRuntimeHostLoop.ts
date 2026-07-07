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
    if (now - last >= tickIntervalMs) {
      args.host.tick(Date.now(), args.activityProvider as any);
      last = now;
    }
    requestAnimationFrame(tick);
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

