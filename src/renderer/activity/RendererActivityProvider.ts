import type { ActivityInputs } from '../../core/activity/ActivityEngine';
import type { ActivityProvider } from '../../core/runtime/ActivityProviders';

import { FallbackActiveAppProvider, type ActiveAppProvider } from './RendererActiveAppProvider';

export type RendererActivityProviderDeps = {
  activeAppProvider?: ActiveAppProvider;
  idleLikeSecondsFloor?: number; // optional guard against NaN
};

// Tracks privacy-safe coarse signals only:
// - idleSeconds: time since last user input (derived from timestamps)
// - typingSeconds: duration of keyboard activity (no raw keys stored)
// - mouseSeconds: duration of mouse activity (no raw path stored)
export class RendererActivityProvider implements ActivityProvider {
  private lastInputAt = performance.now();

  private typingActiveUntil = 0;
  private mouseActiveUntil = 0;

  // When a new input happens, extend the “active until” window.
  // The snapshot converts activity windows into seconds duration.
  private typingWindowMs = 2500;
  private mouseWindowMs = 2500;

  constructor(
    private deps: RendererActivityProviderDeps = {}
  ) {
    this.activeAppProvider = deps.activeAppProvider ?? new FallbackActiveAppProvider();
  }

  private activeAppProvider: ActiveAppProvider;

  // Called by hooks (keyboard/mouse) to mark coarse activity.
  onTypingSignal(nowMs: number) {
    this.lastInputAt = nowMs;
    this.typingActiveUntil = Math.max(this.typingActiveUntil, nowMs + this.typingWindowMs);
  }

  onMouseSignal(nowMs: number) {
    this.lastInputAt = nowMs;
    this.mouseActiveUntil = Math.max(this.mouseActiveUntil, nowMs + this.mouseWindowMs);
  }

  // Called to ensure idleSeconds remains correct even without events.
  private getIdleSeconds(nowMs: number) {
    const idleMs = Math.max(0, nowMs - this.lastInputAt);
    return idleMs / 1000;
  }

  private getWindowSeconds(nowMs: number, activeUntil: number) {
    const effectiveMs = Math.max(0, activeUntil - nowMs);
    // Convert remaining active window into seconds as an intensity proxy.
    return effectiveMs / 1000;
  }

  getSnapshot(nowMs: number): Omit<ActivityInputs, 'nowMs' | never> {
    const idleSeconds = this.getIdleSeconds(nowMs);
    const typingSeconds = this.getWindowSeconds(nowMs, this.typingActiveUntil);
    const mouseSeconds = this.getWindowSeconds(nowMs, this.mouseActiveUntil);

    return {
      idleSeconds: Math.max(this.deps.idleLikeSecondsFloor ?? 0, idleSeconds),
      typingSeconds: Math.max(0, typingSeconds),
      mouseSeconds: Math.max(0, mouseSeconds),
      activeApp: this.activeAppProvider.getActiveApp(),
    } as any;
  }
}

