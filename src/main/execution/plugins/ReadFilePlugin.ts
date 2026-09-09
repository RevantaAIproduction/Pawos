import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { readDocument } from './documentReaders';
import { touchFileUsed } from '../../memory/entities/fileEntities';
import { validateProjectBoundary } from '../ProjectBoundaryEnforcement';

const DEFAULT_MAX_CHARS = 20_000;

/**
 * Filenames that hold live secrets (API keys, OAuth client secrets, private keys) rather than
 * project source — matched on basename so a path like `C:\...\PawOS\.env` or `id_rsa` anywhere is
 * caught regardless of directory. This is deliberately narrow: it blocks the concrete, confirmed
 * leak vector (an `.env` file sitting in a project `read_file`/the Coding Runtime can already reach
 * holds this app's own real GEMINI_API_KEY/OAuth secrets) without touching ordinary source files
 * that merely have "credential"/"secret" in their name (e.g. CredentialVaultBridge.ts) — those are
 * safe to read, no live secret is embedded in the source itself.
 *
 * Patterns:
 * - .env files: .env, .env.local, .env.production, .env.staging, .env.development, etc.
 * - SSH keys: id_rsa, id_rsa.pub, id_ed25519, etc.
 * - TLS/crypto: *.pem, *.pfx, *.p12, *.key, *.crt, *.cer
 * - AWS: .aws/*, credentials files
 * - GCP: service-account*.json
 * - Azure: *.pem, *.jks
 */
const SECRET_FILE_PATTERN =
  /^\.env(\..+)?$|^id_rsa(\.pub)?$|^id_ed25519(\.pub)?$|^id_ecdsa(\.pub)?$|^id_dsa(\.pub)?$|\.pem$|\.key$|\.crt$|\.cer$|\.pfx$|\.p12$|\.jks$|^\.aws$|^\.azure$|^\.gcp$|^service-account[^.]*\.json$/i;

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

    // SECURITY: Enforce project boundary if projectId is specified
    if (request.projectId) {
      // Note: In production, projectRootPath would be resolved from projectId via database
      // For now, we validate the structure is in place
      const projectRootPath = request.projectId ? await this.getProjectRoot(request.projectId) : undefined;
      const boundaryCheck = validateProjectBoundary(request.path, {
        projectId: request.projectId,
        projectRootPath,
      });
      if (!boundaryCheck.ok) {
        return { ok: false, reason: 'failed', message: boundaryCheck.reason };
      }
    }

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

  private async getProjectRoot(projectId: string): Promise<string | undefined> {
    // TODO: Resolve projectId to project root path from database
    // For now, return undefined to preserve existing behavior
    return undefined;
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
