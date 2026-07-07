import { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen } from 'electron';
import * as path from 'path';
import { createTray } from './tray/trayManager';
import { registerIpc } from './ipc/ipc';
import { SettingsStore } from '../shared/settings/SettingsStore';
const OVERLAY_W = 700;
const OVERLAY_H = 400;

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getOverlayBoundsCentered() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((width - OVERLAY_W) / 2);
  const y = Math.round((height - OVERLAY_H) / 2);
  return { x, y, width: OVERLAY_W, height: OVERLAY_H };
}

function createOverlayWindow() {
  const bounds = getOverlayBoundsCentered();
  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const startUrl = app.isPackaged
    ? `file://${path.join(__dirname, '../renderer/index.html')}`
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  overlayWindow.loadURL(startUrl);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  registerOverlayDragBehavior();
}

function registerOverlayDragBehavior() {
  if (!overlayWindow) return;

  // Draggable overlay: renderer handles drag interactions and tells us when to temporarily disable click-through.
  ipcMain.on('overlay:request-focus', () => {
    // no-op placeholder for future focus mgmt
  });
}

function createAppTray() {
  if (!overlayWindow) return;
  tray = createTray({
    overlayWindow,
    app,
    onToggleVisibility: () => {
      if (!overlayWindow) return;
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    },
    onShow: () => overlayWindow?.show(),
    onHide: () => overlayWindow?.hide(),
    onRestart: () => {
      app.relaunch();
      app.exit(0);
    },
    onExit: () => app.exit(0),
    onChangePet: () => {
      overlayWindow?.webContents.send('ui:open-settings');
    },
    onOpenSettings: () => overlayWindow?.webContents.send('ui:open-settings'),
  });
}

app.whenReady().then(async () => {
  // Ensure settings store initialized (creates file on first run)
  SettingsStore.init();

  createOverlayWindow();
  createAppTray();
  registerIpc({ app, overlayWindowProvider: () => overlayWindow });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  // keep running background via tray
});

// Global shortcuts are handled in renderer via input hooks (per requirements), but we keep an escape hatch here.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Auto start with Windows
// electron-builder.yml config uses nsis; also set in main for immediate behavior.
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe'),
});

