import { app } from 'electron';
import * as path from 'path';

/**
 * Resolves the base `assets/` directory correctly in both dev and packaged
 * modes. Packaged: extraResources puts it at <resources>/assets, always
 * reachable via process.resourcesPath regardless of asar nesting math.
 * Dev: main.js runs compiled at <project>/dist/main/main.js, so two levels
 * up reaches <project>/assets.
 */
export function getAssetsBaseDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, '../../assets');
}

export function getAnimationsDir(): string {
  return path.join(getAssetsBaseDir(), 'animations');
}

export function getCharactersDir(): string {
  return path.join(getAssetsBaseDir(), 'characters');
}

export function getBrandingDir(): string {
  return path.join(getAssetsBaseDir(), 'branding');
}

/**
 * Pets live under src/assets/pets in dev (not root assets/) — packaging
 * merges both src/assets and root assets into the same <resources>/assets,
 * so only the dev branch needs the different subpath.
 */
export function getPetsDir(): string {
  if (app.isPackaged) {
    return path.join(getAssetsBaseDir(), 'pets');
  }
  return path.join(__dirname, '../../src/assets/pets');
}

/**
 * Only meaningful in dev — `electron .` shows Electron's default icon on
 * the taskbar/window unless a BrowserWindow icon is set explicitly.
 * Packaged builds already get the real icon baked into the .exe itself
 * (electron-builder.yml win.icon), so this returns null there and the
 * BrowserWindow options should simply omit `icon` to inherit that.
 */
export function getDevWindowIconPath(): string | null {
  if (app.isPackaged) return null;
  return path.join(__dirname, '../../build/icon.ico');
}
