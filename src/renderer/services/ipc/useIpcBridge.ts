import { useMemo } from 'react';
import { getIpcBridge } from './ipcBridge';
import type { SettingsState } from './ipcTypes';

export function useIpcBridge() {
  const ipc = useMemo(() => getIpcBridge(), []);

  return {
    getSettings: async (): Promise<SettingsState> => ipc.settingsGet(),
    petsList: async () => ipc.petsList(),

    loadPet: async (petId: string) => ipc.petsLoad(petId),

    setSettings: async (partial: Partial<SettingsState>) => ipc.settingsSet(partial),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => ipc.onSettingsUpdated(cb),
    onUiOpenSettings: (cb: () => void) => ipc.onUiOpenSettings(cb),
  };
}

