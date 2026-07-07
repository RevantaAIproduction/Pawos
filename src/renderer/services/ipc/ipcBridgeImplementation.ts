import type { SettingsState } from './ipcTypes';
import { getIpcBridge } from './ipcBridge';

// Lazy initialization - access the bridge only when first needed
let _bridge: ReturnType<typeof getIpcBridge> | undefined;

function getBridge() {
  if (!_bridge) {
    _bridge = getIpcBridge();
    if (!_bridge) {
      throw new Error('IPC bridge not initialized. Preload may not have loaded.');
    }
  }
  return _bridge;
}

export const ipc = {
  async settingsGet(): Promise<SettingsState> {
    return getBridge().settingsGet();
  },
  async settingsSet(partial: Partial<SettingsState>) {
    return getBridge().settingsSet(partial);
  },
  async petsList() {
    return getBridge().petsList();
  },
  async petsLoad(petId: string) {
    return getBridge().petsLoad(petId);
  },
  onSettingsUpdated(cb: (s: SettingsState) => void) {
    getBridge().onSettingsUpdated(cb);
  },
  onUiOpenSettings(cb: () => void) {
    getBridge().onUiOpenSettings(cb);
  },
};

export type IpcApi = typeof ipc;

export type IpcSettings = SettingsState;

