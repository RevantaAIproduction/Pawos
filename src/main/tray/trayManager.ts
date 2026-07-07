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
      return require('path').join(__dirname, '../../../assets/tray.png');
    } catch {
      return '';
    }
  })();

  const tray = new Tray(iconPath);
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

