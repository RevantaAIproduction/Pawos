export function createIdleDetector(args: { idleLieMs: number; idleSleepMs: number }) {
  let lastInput = performance.now();
  let state: 'active' | 'lie' | 'sleep' = 'active';

  const updateState = () => {
    const idleFor = performance.now() - lastInput;
    if (idleFor >= args.idleSleepMs) state = 'sleep';
    else if (idleFor >= args.idleLieMs) state = 'lie';
    else state = 'active';
  };

  const onInput = () => {
    lastInput = performance.now();
    state = 'active';
  };

  const getState = () => {
    updateState();
    return { state, idleLieMs: args.idleLieMs, idleSleepMs: args.idleSleepMs } as const;
  };

  // tickless; fsm/controller can call onInput/getState
  return { onInput, getState };
}

