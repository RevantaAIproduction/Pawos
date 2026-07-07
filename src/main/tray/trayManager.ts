import { BrowserWindow, Tray, app, Menu } from 'electron';

export function createTray(opts: {
  overlayWindow: BrowserWindow;
  app: typeof app;
  onToggleVisibility: () => void;
  onShow: () => void;
  onHide: () => void;
  onRestart: () => void;
  onExit: () => void;
  onChangePet: () => void;
  onOpenSettings: () => void;
}): Tray {
  // Icon: use app icon or placeholder
  const iconPath = (() => {
    // During dev/packaged, icon may differ; electron will fall back if missing.
    try {
      const path = require('path');
      const fs = require('fs');
      const fullPath = path.join(__dirname, '../../../assets/tray.png');
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
      return '';
    } catch {
      return '';
    }
  })();

  // Skip tray creation if no icon is available (avoid Electron Tray errors)
  if (!iconPath) {
    console.warn('Tray icon not found; skipping tray creation');
    return null as any;
  }

  let tray: Tray;
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    // If tray creation fails, skip it
    console.warn('Failed to create tray:', err);
    return null as any;
  }
  tray.setToolTip('CompanionOS');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Companion',
      click: () => opts.onShow(),
    },
    {
      label: 'Hide Companion',
      click: () => opts.onHide(),
    },
    {
      label: 'Change Companion',
      click: () => opts.onChangePet(),
    },
    {
      type: 'separator',
    },
    {
      label: 'Settings',
      click: () => opts.onOpenSettings(),
    },
    {
      label: 'Restart',
      click: () => opts.onRestart(),
    },
    {
      type: 'separator',
    },
    {
      label: 'Exit',
      click: () => opts.onExit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => opts.onToggleVisibility());

  return tray;
}

