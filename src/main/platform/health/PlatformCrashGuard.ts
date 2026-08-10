import { app } from 'electron';
import { platformEventBus } from '../events/PlatformEventBus';

let installed = false;

/**
 * The main-process crash safety net — confirmed entirely absent before this
 * phase (no `process.on('uncaughtException'|'unhandledRejection')`, no
 * `app.on('child-process-gone')` anywhere in the codebase).
 *
 * Important, easy-to-get-wrong detail: Node's default behavior when an
 * `uncaughtException`/`unhandledRejection` has no listener is to print the
 * error and terminate the process. Adding a listener SUPPRESSES that default
 * — without an explicit exit, PawOS would silently start surviving fatal
 * errors it used to crash on instead, a real (if well-intentioned) change to
 * existing runtime behavior. Both handlers below report the event and then
 * call `app.exit(1)` to preserve today's actual crash-on-fatal-error
 * behavior exactly — this is a reporting layer added in front of an
 * unchanged failure mode, not a change to the failure mode itself.
 *
 * `app.on('child-process-gone', ...)` covers GPU/Utility/other child process
 * crashes — `'gpu-process-crashed'` does not exist in this Electron version
 * (37.10.3); `child-process-gone`'s `details.type === 'GPU'` is the correct
 * replacement. Renderer-process crashes are deliberately NOT duplicated here
 * via `app.on('render-process-gone', ...)` — `main.ts`'s existing
 * `attachDiagnostics()` already installs a per-window `webContents`-level
 * `render-process-gone` listener for both windows this app ever creates, and
 * that listener now also reports into the bus (see main.ts). Adding a
 * second, app-level listener for the same event would double-report every
 * renderer crash.
 */
export function installPlatformCrashGuard(): void {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', (error) => {
    platformEventBus.reportRuntimeEvent({
      kind: 'crash',
      runtime: 'desktop',
      severity: 'critical',
      processType: 'main',
      message: error.message,
      stack: error.stack,
    });
    app.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    platformEventBus.reportRuntimeEvent({
      kind: 'crash',
      runtime: 'desktop',
      severity: 'critical',
      processType: 'main',
      message: error.message,
      stack: error.stack,
    });
    app.exit(1);
  });

  app.on('child-process-gone', (_event, details) => {
    platformEventBus.reportRuntimeEvent({
      kind: 'crash',
      runtime: 'desktop',
      severity: 'critical',
      processType: details.type === 'GPU' ? 'gpu' : 'child',
      message: `${details.type} process gone: ${details.reason}`,
    });
  });
}

/** Exposed for tests only — resets the module-level install guard. */
export function resetPlatformCrashGuardForTesting(): void {
  installed = false;
}
