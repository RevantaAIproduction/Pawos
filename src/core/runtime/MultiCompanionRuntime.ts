import type { ActivityEngine, ActivitySnapshot } from '../activity/ActivityEngine';
import type { Companion } from '../types/CompanionTypes';


export type RuntimeEvent =
  | { type: 'companion.loaded'; companionId: string }
  | { type: 'companion.activated'; companionId: string }
  | { type: 'companion.mood.updated'; companionId: string; mood: string };

export type CompanionRuntimeContext = {
  runtime: MultiCompanionRuntime;
  nowMs: number;
  activity?: ActivitySnapshot;
};

export type CompanionAdapter = {
  start?(companion: Companion, ctx: CompanionRuntimeContext): Promise<void> | void;
  stop?(companion: Companion, ctx: CompanionRuntimeContext): Promise<void> | void;
  onActivity?(companion: Companion, activity: ActivitySnapshot, ctx: CompanionRuntimeContext): void;
};

export class MultiCompanionRuntime {
  private companions = new Map<string, Companion>();
  private adapters = new Map<string, CompanionAdapter>();
  private active = false;

  constructor(private activityEngine: ActivityEngine) {}

  register(companion: Companion, adapter: CompanionAdapter) {
    this.companions.set(companion.id, companion);
    this.adapters.set(companion.id, adapter);
  }

  async start() {
    if (this.active) return;
    this.active = true;
    // foundation only; actual ticking will be wired into renderer.
  }

  async stop() {
    if (!this.active) return;
    this.active = false;
    const nowMs = Date.now();

    for (const [id, c] of this.companions.entries()) {
      const adapter = this.adapters.get(id);
      await adapter?.stop?.(c, { runtime: this, nowMs });
    }
  }

  tick(nowMs: number, rawActivityProvider: () => Omit<ActivitySnapshot, 'category'> & { activeApp: string }) {
    if (!this.active) return;

    const activity = this.activityEngine.snapshot({
      nowMs,
      activeApp: rawActivityProvider().activeApp,
      idleSeconds: rawActivityProvider().idleSeconds,
      typingSeconds: rawActivityProvider().typingSeconds,
      mouseSeconds: rawActivityProvider().mouseSeconds,
    });

    for (const [id, c] of this.companions.entries()) {
      const adapter = this.adapters.get(id);
      adapter?.onActivity?.(c, activity, { runtime: this, nowMs, activity });
    }
  }
}

