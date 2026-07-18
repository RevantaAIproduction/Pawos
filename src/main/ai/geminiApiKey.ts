import { app } from 'electron';
import * as path from 'path';
import { readEnvFile } from '../env/readEnvFile';

let cached: string | undefined;

/** Same .env lookup main.ts already does for the renderer's Gemini key — read independently here so file-runtime plugins (main process) don't need an IPC round-trip or a circular import back into main.ts. */
export function getGeminiApiKey(): string | undefined {
  if (cached !== undefined) return cached;
  const envVars = readEnvFile([path.dirname(app.getPath('exe')), process.cwd(), app.getAppPath()]);
  cached = envVars.GEMINI_API_KEY;
  return cached;
}
