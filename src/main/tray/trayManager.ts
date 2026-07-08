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
  // Icon: try multiple locations that differ between dev and packaged apps
  const iconPath = (() => {
    try {
      const path = require('path');
      const fs = require('fs');

      const candidates: string[] = [];

      // 1) resources path (unpacked location): <resources>/assets/tray.png
      if (process && typeof process.resourcesPath === 'string') {
        candidates.push(path.join(process.resourcesPath, 'assets', 'tray.png'));
      }

      // 2) app.getAppPath() + assets (works in some packaged setups)
      try {
        const appPath = opts.app.getAppPath();
        candidates.push(path.join(appPath, 'assets', 'tray.png'));
        // some builders place files under src/..., include that possibility
        candidates.push(path.join(appPath, 'src', 'assets', 'tray.png'));
      } catch {}

      // 3) relative to __dirname (development)
      try {
        candidates.push(path.join(__dirname, '../../../assets/tray.png'));
      } catch {}

      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const stats = fs.statSync(p);
            if (stats.size > 100) return p; // require reasonable size
          }
        } catch {}
      }

      return '';
    } catch {
      return '';
    }
  })();

  // Skip tray creation if no valid icon is available
  if (!iconPath) {
    console.warn('Tray icon not found or invalid; skipping tray creation');
    return null as any;
  }

  let tray: Tray;
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    // If tray creation fails, skip it gracefully
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

