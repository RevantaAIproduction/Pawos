import * as path from 'path';

export interface ProtocolRegistrationDeps {
  isStore: boolean;
  /** process.defaultApp — true for an unpackaged `electron .` dev run. */
  defaultApp: boolean | undefined;
  argv: string[];
  execPath: string;
  setAsDefaultProtocolClient: (protocol: string, path?: string, args?: string[]) => boolean;
}

/**
 * Registers PawOS as the pawos:// handler.
 *
 * - Microsoft Store (MSIX): the protocol is declared in the package manifest
 *   (electron-builder adds it from the `protocols` config). A runtime registration
 *   would only write a virtualized HKCU\Software\Classes key that Windows ignores for
 *   packaged apps, so it's skipped — deep-link delivery (cold-start argv and
 *   'second-instance') is unchanged.
 * - Direct download (NSIS) / dev: registers at runtime exactly as before.
 */
export function registerPawosProtocolClient(deps: ProtocolRegistrationDeps): 'manifest' | 'runtime' {
  if (deps.isStore) return 'manifest';
  // The unpackaged (`electron .`) form needs the exe path + script arg explicitly —
  // Windows can't otherwise reconstruct how to relaunch a dev build from a protocol click.
  if (deps.defaultApp) {
    const scriptArg = deps.argv[1];
    if (scriptArg) {
      deps.setAsDefaultProtocolClient('pawos', deps.execPath, [path.resolve(scriptArg)]);
    }
  } else {
    deps.setAsDefaultProtocolClient('pawos');
  }
  return 'runtime';
}
