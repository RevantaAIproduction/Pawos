import type { SettingsState } from './ipcTypes';

export function contextBridge() {
  if (typeof window === 'undefined') {
    throw new Error('window is not defined');
  }

  const ipcApi = (window as any).electron?.ipcRenderer;


  function on(channel: string, cb: (...args: any[]) => void) {
    ipcApi?.on(channel, (_: any, payload: any) => cb(payload));
  }

  return {
    settingsGet: async (): Promise<SettingsState> => ipcApi.invoke('settings:get'),
    settingsSet: async (partial: Partial<SettingsState>) => ipcApi.invoke('settings:set', partial),

    petsList: async () => ipcApi.invoke('pets:list'),
    petsLoad: async (petId: string) => ipcApi.invoke('pets:load', petId),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => on('settings:updated', cb),
    onUiOpenSettings: (cb: () => void) => on('ui:open-settings', cb),
  };
}

