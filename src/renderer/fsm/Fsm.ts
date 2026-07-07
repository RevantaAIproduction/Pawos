export type FsmEvent = { type: string; [k: string]: any };

export type StateName = string;

export type StateHandler<TCtx> = {
  enter?: (ctx: TCtx, evt?: FsmEvent) => void;
  exit?: (ctx: TCtx) => void;
  update?: (ctx: TCtx, dtMs: number) => void;
  onEvent?: (ctx: TCtx, evt: FsmEvent) => void;
};

export class Fsm<TCtx> {
  private state: StateName;
  private states: Record<StateName, StateHandler<TCtx>>;

  constructor(initial: StateName, states: Record<StateName, StateHandler<TCtx>>) {
    this.state = initial;
    this.states = states;
  }

  getState(): StateName {
    return this.state;
  }

  transition(next: StateName, ctx: TCtx, evt?: FsmEvent) {
    if (next === this.state) return;
    this.states[this.state]?.exit?.(ctx);
    this.state = next;
    this.states[this.state]?.enter?.(ctx, evt);
  }

  dispatch(evt: FsmEvent, ctx: TCtx) {
    this.states[this.state]?.onEvent?.(ctx, evt);
  }

  update(dtMs: number, ctx: TCtx) {
    this.states[this.state]?.update?.(ctx, dtMs);
  }
}

