import { app, BrowserWindow, ipcMain } from 'electron';
import { SettingsStore } from '../../shared/settings/SettingsStore';
import { CompanionLoader } from '../../shared/CompanionLoader';

export function registerIpc(opts: {
  app: typeof app;
  overlayWindowProvider: () => BrowserWindow | null;
}) {
  ipcMain.handle('settings:get', () => SettingsStore.getState());
  ipcMain.handle('settings:set', async (_evt, partial: any) => {
    SettingsStore.update(partial);
    const win = opts.overlayWindowProvider();
    win?.webContents.send('settings:updated', SettingsStore.getState());
    return SettingsStore.getState();
  });

  ipcMain.handle('pets:list', async () => {
    const pets = await CompanionLoader.listCompanions();
    return pets.map((p) => ({ id: p.id, name: p.name }));
  });

  ipcMain.handle('pets:load', async (_evt, petId: string) => {
    const pet = await CompanionLoader.loadCompanion(petId);
    // Shared CompanionLoader returns a renderer-usable serialized shape.
    return pet;
  });

  ipcMain.on('ui:open-settings', () => {
    opts.overlayWindowProvider()?.webContents.send('ui:open-settings');
  });
}

