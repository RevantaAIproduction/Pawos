import { contextBridge } from './windowBridge';

// In preload we expose window.__pawos_ipc__
export type IpcBridge = ReturnType<typeof contextBridge>;

export function getIpcBridge(): IpcBridge {
  return (window as any).__pawos_ipc__ as IpcBridge;
}


