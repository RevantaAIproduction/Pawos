import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { readDocument } from './documentReaders';
import { touchFileUsed } from '../../memory/entities/fileEntities';

const DEFAULT_MAX_CHARS = 20_000;

/**
 * Filenames that hold live secrets (API keys, OAuth client secrets, private keys) rather than
 * project source — matched on basename so a path like `C:\...\PawOS\.env` or `id_rsa` anywhere is
 * caught regardless of directory. This is deliberately narrow: it blocks the concrete, confirmed
 * leak vector (an `.env` file sitting in a project `read_file`/the Coding Runtime can already reach
 * holds this app's own real GEMINI_API_KEY/OAuth secrets) without touching ordinary source files
 * that merely have "credential"/"secret" in their name (e.g. CredentialVaultBridge.ts) — those are
 * safe to read, no live secret is embedded in the source itself.
 */
const SECRET_FILE_PATTERN = /^\.env(\..+)?$|^id_rsa\w*$|\.pem$|\.pfx$|\.p12$/i;

function isSecretFile(filePath: string): boolean {
  return SECRET_FILE_PATTERN.test(path.basename(filePath));
}

/** Reads a file's content into context — non-destructive. searchFiles only ever returns matching paths, never contents; this is the gap that fills. */
export class ReadFilePlugin extends BasePlugin {
  id = 'readFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'readFile') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'file-missing', message: `I can't find "${request.path}" — which file did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'readFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (isSecretFile(request.path)) {
      return {
        ok: false,
        reason: 'failed',
        message: `"${path.basename(request.path)}" holds live secrets (API keys/credentials) — I don't read or display secret files, even if asked. Manage these in your OS file manager or a text editor directly, never through me.`,
      };
    }
    try {
      const stat = await fs.promises.stat(request.path);
      if (stat.isDirectory()) return { ok: false, reason: 'failed', message: `"${request.path}" is a folder, not a file.` };

      const maxChars = request.maxChars ?? DEFAULT_MAX_CHARS;
      const result = await readDocument(request.path, request.format ?? 'auto', maxChars);
      touchFileUsed(request.path);
      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'readFile') return 'Working on that…';
    return `Reading ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'readFile') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { truncated?: boolean } | undefined;
    return data?.truncated
      ? `I've read ${path.basename(request.path)} (truncated — it's long).`
      : `I've read ${path.basename(request.path)}.`;
  }
}

export const readFilePlugin = new ReadFilePlugin();
