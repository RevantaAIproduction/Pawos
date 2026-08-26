import { getIpcBridge } from '../services/ipc/ipcBridge';

let installed = false;

function report(message: string, stack?: string): void {
  try {
    getIpcBridge().reportPlatformRendererEvent({ message, stack });
  } catch {
    // The bridge itself failing must never throw back out of the very
    // window-level error handler that's reporting a failure.
  }
}

/**
 * The renderer-process crash safety net — confirmed entirely absent before
 * this phase (no `window.onerror`/`unhandledrejection` listener anywhere in
 * `src/renderer`). Uses `addEventListener` rather than assigning
 * `window.onerror` directly, so this never clobbers a handler some other
 * part of the app might register later — purely additive.
 *
 * Both listeners forward through the existing preload/IPC bridge pattern
 * (`ipcRenderer.send`, mirroring `companionNotifyReady`'s fire-and-forget
 * shape) to `platform:reportRendererEvent`, which the main process turns
 * into a real `RuntimeCrashEvent` on the Platform Event Bus (see
 * `src/main/ipc/ipc.ts`). Neither listener calls `event.preventDefault()` —
 * the browser's own default error handling (surfacing in devtools, etc.) is
 * left completely untouched; this only adds a second, silent observer.
 */
export function installRendererCrashGuard(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    console.error('CRASH_STACK_DUMP:', event.error?.stack ?? '(no stack)', 'colno=', event.colno, 'lineno=', event.lineno, 'filename=', event.filename);
    report(event.error?.message ?? event.message, event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    report(error.message, error.stack);
  });
}

/** Exposed for tests only. */
export function resetRendererCrashGuardForTesting(): void {
  installed = false;
}
