export type LivingAction =
  | 'walk'
  | 'sit'
  | 'stretch'
  | 'drinkCoffee'
  | 'readBooks'
  | 'lookAround'
  | 'sleep'
  | 'wander';

export type LivingPlan = {
  companionId: string;
  action: LivingAction;
  startAtMs: number;
  durationMs: number;
};

export type LivingEngineSnapshot = {
  // high level; actual execution should be handled by behavior engine/plugins
  pendingPlan?: LivingPlan;
};

export class LivingDesktopEngine {
  // Schedules autonomous actions when user is idle.
  // This foundation is non-visual and plugin-agnostic.

  private lastPlanByCompanion = new Map<string, LivingPlan>();

  constructor(private opts?: { idleSecondsThreshold?: number }) {}

  tick(companionId: string, idleSeconds: number, nowMs: number): LivingEngineSnapshot {
    const threshold = this.opts?.idleSecondsThreshold ?? 60;
    if (idleSeconds < threshold) return {};

    const prev = this.lastPlanByCompanion.get(companionId);
    if (prev && nowMs < prev.startAtMs + prev.durationMs) {
      return { pendingPlan: prev };
    }

    const plan = this.createPlan(companionId, nowMs);
    this.lastPlanByCompanion.set(companionId, plan);
    return { pendingPlan: plan };
  }

  private createPlan(companionId: string, nowMs: number): LivingPlan {
    const pool: LivingAction[] = ['walk', 'sit', 'stretch', 'drinkCoffee', 'readBooks', 'lookAround', 'wander', 'sleep'];
    const action = pool[Math.floor(Math.random() * pool.length)];

    const durationMs =
      action === 'sleep' ? randRange(45, 90) * 1000 : randRange(10, 35) * 1000;

    return { companionId, action, startAtMs: nowMs, durationMs };
  }
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

