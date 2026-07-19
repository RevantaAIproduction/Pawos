import type {
  CompanionGesture,
  CompanionState,
  CompanionSubsystem,
  RuntimeContext,
  RuntimeEvent,
  RuntimeEventListener,
} from './CompanionStates';

const GESTURE_TO_STATE: Record<CompanionGesture, CompanionState> = {
  greeting: 'greeting',
  sitting: 'sitting',
  jumping: 'jumping',
  highFive: 'greeting',
  waving: 'waving',
  pointing: 'pointing',
};

/** How long each transient gesture holds before handing control back. */
const GESTURE_DURATION_MS: Record<CompanionState, number> = {
  greeting: 2500,
  sitting: 3000,
  jumping: 550,
  waving: 2000,
  pointing: 1800,
  idle: 0,
  walking: 0,
  listening: 0,
  thinking: 0,
  talking: 0,
  typing: 0,
  celebrating: 2500,
  sleeping: 0,
  disabled: 0,
};

/**
 * A subsystem that can request one of the "reactive" states — voice
 * (listening/thinking/talking) always wins over idle-life scheduling
 * (walking/sleeping). Implemented by VoiceController and ActionController.
 */
export interface StateRequester {
  desiredState(now: number, current: CompanionState): CompanionState | null;
}

/**
 * The single source of truth for "what is the companion doing right now."
 * Every capability (locomotion, expression, voice, future Gemini-driven
 * actions) is a CompanionSubsystem plugged in here instead of deciding
 * things independently — replaces the split-brain that used to exist
 * between Avatar3DOverlay's own idle-life closures and the legacy 2D
 * CompanionAnimationFsmController.
 */
export class CompanionRuntime {
  private state: CompanionState = 'idle';
  private subsystems: CompanionSubsystem[] = [];
  private voiceRequester: StateRequester | null = null;
  private actionRequester: StateRequester | null = null;
  private listeners = new Set<RuntimeEventListener>();
  private disabled = false;
  private activeGesture: { state: CompanionState; startedAt: number } | null = null;

  constructor(private ctx: RuntimeContext) {}

  register(subsystem: CompanionSubsystem): void {
    this.subsystems.push(subsystem);
  }

  /** Voice always outranks idle-life (walking/sleeping) and any in-progress gesture. */
  setVoiceRequester(requester: StateRequester): void {
    this.voiceRequester = requester;
  }

  /** Idle-life scheduling (walking/sleeping) — lowest priority, only consulted when nothing else wants control. */
  setActionRequester(requester: StateRequester): void {
    this.actionRequester = requester;
  }

  on(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): CompanionState {
    return this.state;
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  /** Voice command target: "disable yourself" -> runtime.disable(). Re-enabling is intentionally NOT exposed here — only the manual Electron toggle can do that. */
  disable(): void {
    this.disabled = true;
  }

  enable(): void {
    this.disabled = false;
  }

  /**
   * Explicitly request a one-shot gesture (sit/jump/greet/high-five).
   * Ignored if voice currently owns the state (a real conversation event
   * always takes priority over a queued gesture) or the runtime is
   * disabled. Returns whether the gesture was accepted.
   */
  performGesture(gesture: CompanionGesture): boolean {
    if (this.disabled) return false;
    const now = Date.now();
    if (this.voiceRequester?.desiredState(now, this.state)) return false;
    this.activeGesture = { state: GESTURE_TO_STATE[gesture], startedAt: now };
    return true;
  }

  private resolveDesiredState(now: number): CompanionState {
    if (this.disabled) return 'disabled';

    const voiceState = this.voiceRequester?.desiredState(now, this.state);
    if (voiceState) {
      this.activeGesture = null; // a real conversation event interrupts any in-progress gesture
      return voiceState;
    }

    if (this.activeGesture) {
      const duration = GESTURE_DURATION_MS[this.activeGesture.state] || 1000;
      if (now - this.activeGesture.startedAt < duration) return this.activeGesture.state;
      this.activeGesture = null;
    }

    return this.actionRequester?.desiredState(now, this.state) ?? 'idle';
  }

  private transitionTo(next: CompanionState): void {
    const from = this.state;
    for (const s of this.subsystems) s.onExit?.(from, this.ctx);
    this.state = next;
    for (const s of this.subsystems) s.onEnter?.(next, this.ctx);
    const event: RuntimeEvent = { type: 'stateChanged', from, to: next };
    for (const l of this.listeners) l(event);
  }

  /** Drives the tick: resolves the desired state, transitions if needed, then updates every subsystem. Call once per animation frame. */
  update(deltaSeconds: number): void {
    const desired = this.resolveDesiredState(Date.now());
    if (desired !== this.state) this.transitionTo(desired);
    for (const s of this.subsystems) s.update?.(deltaSeconds, this.ctx);
  }
}
