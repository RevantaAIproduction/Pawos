import {
  contextBridge as electronContextBridge,
  ipcRenderer,
} from "electron";

import type { SettingsState } from "../../renderer/services/ipc/ipcTypes";

export function contextBridge() {
  const api = {
    settingsGet: () => ipcRenderer.invoke("settings:get") as Promise<SettingsState>,
    settingsSet: (partial: Partial<SettingsState>) =>
      ipcRenderer.invoke("settings:set", partial) as Promise<SettingsState>,

    petsList: () => ipcRenderer.invoke("pets:list") as Promise<Array<{ id: string; name: string }>>,
    petsLoad: (petId: string) => ipcRenderer.invoke("pets:load", petId),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => {
      ipcRenderer.on("settings:updated", (_: any, payload: SettingsState) => cb(payload));
    },

    onUiOpenSettings: (cb: () => void) => {
      ipcRenderer.on("ui:open-settings", () => cb());
    },
  };

  electronContextBridge.exposeInMainWorld("__pawos_ipc__", api);
}

