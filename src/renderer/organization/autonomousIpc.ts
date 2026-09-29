/**
 * The main-process channels Autonomous Work uses, routed through the preload bridge the app
 * actually exposes (`window.__pawos_ipc__`, see src/main/preload/bridgeImpl.ts).
 *
 * The orchestrator used to reach for `window.electron.ipcRenderer`, which the production preload
 * never exposes (contextIsolation is on and only `__pawos_ipc__` is exposed) — so billing
 * settlement, per-request cost checks and Jira/Linear write-back silently never ran in the
 * shipped app. Unit tests have no preload and stub `window.electron.ipcRenderer`; that stub is
 * used only when `__pawos_ipc__` is absent.
 */
export interface AutonomousIpc {
  invoke(channel: string, ...args: any[]): Promise<any>;
}

type Bridge = Record<string, (...args: any[]) => Promise<any>>;

const CHANNEL_TO_BRIDGE_METHOD: Record<string, string> = {
  'billing:getPawComputeConfig': 'billingGetPawComputeConfig',
  'billing:settleAutonomousRun': 'billingSettleAutonomousRun',
  'connectivity:postJiraComment': 'connectivityPostJiraComment',
  'connectivity:transitionJiraIssue': 'connectivityTransitionJiraIssue',
  'connectivity:postLinearComment': 'connectivityPostLinearComment',
  'connectivity:transitionLinearIssue': 'connectivityTransitionLinearIssue',
};

export function getAutonomousIpc(): AutonomousIpc | null {
  const w = (typeof window !== 'undefined' ? window : undefined) as any;
  const bridge: Bridge | undefined = w?.__pawos_ipc__;
  if (bridge) {
    return {
      invoke(channel: string, ...args: any[]) {
        const method = CHANNEL_TO_BRIDGE_METHOD[channel];
        const fn = method ? bridge[method] : undefined;
        if (typeof fn !== 'function') return Promise.reject(new Error(`IPC channel not exposed by the preload bridge: ${channel}`));
        return fn(...args);
      },
    };
  }
  return w?.electron?.ipcRenderer ?? null;
}

export const AUTONOMOUS_IPC_CHANNELS = Object.keys(CHANNEL_TO_BRIDGE_METHOD);
