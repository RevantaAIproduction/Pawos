/**
 * Electron's ipcRenderer.invoke() wraps any error thrown in the main
 * process as `Error invoking remote method '<channel>': Error: <message>`
 * — strips that boilerplate down to just what the main process actually
 * said (e.g. "Incorrect password."), which is what should reach the UI.
 */
export function cleanIpcErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/Error invoking remote method '[^']*':\s*(?:Error:\s*)?([\s\S]*)$/);
  return (match ? match[1] : raw).trim();
}
