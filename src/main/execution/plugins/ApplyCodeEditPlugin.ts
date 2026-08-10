import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileModified } from '../../memory/entities/fileEntities';
import { recoverByRetry } from '../RecoverByRetry';
import { applyCodeEditHunks } from '../patchApplier';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { findProjectRootFor } from '../findProjectRoot';
import { recordCodingEditHistory } from '../../memory/entities/codingRuntimeMemoryEntities';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — a real patch-based edit primitive, additive
 * alongside WriteFilePlugin's whole-file overwrite (kept unchanged for its own create/replace-
 * everything job). Locates each hunk's `contextBefore + oldLines` in the current file content to
 * compute correct `@@ -a,b +c,d @@` line numbers (patchApplier.ts), converts the batch into a real
 * unified-diff string, then applies it via the `diff` package's own `applyPatch()` — never a
 * bespoke substring splice.
 */
export class ApplyCodeEditPlugin extends BasePlugin {
  id = 'applyCodeEdit';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'applyCodeEdit';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'applyCodeEdit') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'file-missing', message: `"${request.path}" doesn't exist yet — use writeFile to create it, or applyCodeEdit once it does.` }];
    }
    if (request.edits.length === 0) {
      return [{ id: 'no-edits', message: 'What change should I make to this file?' }];
    }
    const unanchored = request.edits.find((e) => e.contextBefore.length === 0 && e.oldLines.length === 0);
    if (unanchored) {
      return [{ id: 'no-anchor', message: 'One of the edits has no surrounding context or old lines to anchor its location in the file.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'applyCodeEdit') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.path)) {
      return { ok: false, reason: 'failed', message: `"${request.path}" doesn't exist — use writeFile to create a new file.` };
    }
    if (!request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const original = await fs.promises.readFile(request.path, 'utf-8');
      const patched = applyCodeEditHunks(original, request.edits);
      if (!patched.ok) return { ok: false, reason: 'failed', message: patched.message };

      await fs.promises.writeFile(request.path, patched.newContent, 'utf-8');
      onFileModified(request.path);

      return {
        ok: true,
        data: { hunksApplied: request.edits.length, contentHash: sha256(patched.newContent) },
      };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  /**
   * Re-confirms the persisted file actually matches what execute() computed (a hash comparison, not
   * a full-content one — the same "never just trust the exit code" discipline as GitCommitPlugin's
   * own verify(), sized for a potentially large file), then — a legitimate cheap reuse — runs the
   * resolved LanguageProvider's syntaxCheck() (§4) as a sanity check before the heavier Validation
   * Pipeline (a later phase) runs. A file with no matching provider honestly skips this check rather
   * than assuming it passed.
   */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'applyCodeEdit' || !result.ok) return result;
    const data = result.data as { hunksApplied: number; contentHash: string } | undefined;
    if (!data) return result;

    let written: string;
    try {
      written = await fs.promises.readFile(request.path, 'utf-8');
    } catch (error) {
      return { ok: false, reason: 'failed', message: `The edit applied, but I couldn't confirm it afterward: ${(error as Error).message}` };
    }
    if (sha256(written) !== data.contentHash) {
      return { ok: false, reason: 'failed', message: 'The edit applied, but the file on disk no longer matches what was written — something else may have changed it.' };
    }

    const provider = languageProviderRegistry.getProviderForFile(request.path);
    const syntaxChecked = typeof provider?.syntaxCheck === 'function';
    if (syntaxChecked && provider?.syntaxCheck) {
      const check = provider.syntaxCheck(written, request.path);
      if (!check.ok) {
        return { ok: false, reason: 'failed', message: `The edit applied, but the resulting file has a syntax problem: ${check.message ?? 'unknown syntax error'}` };
      }
    }

    // Coding Runtime Memory (§14) — auto-recorded here, not model-invoked, immediately after a real
    // success is confirmed: this is the actual "an edit was applied" event, the primary write path
    // into codingEditHistory. projectRoot is derived (never guessed) by walking up to the nearest
    // package.json — applyCodeEdit's ActionRequest carries only an absolute file path, no rootPath —
    // and is honestly skipped (no history entry) for a file outside any real project, e.g. a scratch
    // file with no package.json ancestor.
    const projectRoot = findProjectRootFor(request.path);
    if (projectRoot) {
      const count = data.hunksApplied;
      // Root-relative, matching codingFeatureEntities.ts's codeFile.path convention (see
      // FeatureMapBuilder's normalizeRel) — using an absolute path here would mint a second,
      // disconnected codeFile entity for the same physical file Feature Discovery already tracks.
      // path.relative() returns backslash-separated segments on Windows, but FeatureMapBuilder's
      // normalizeRel always forward-slashes its output before writing codeFile.path — without the
      // same normalization here, editing a file Feature Discovery already tracks would silently mint
      // a second, disconnected codeFile entity on Windows (an exact-string-match lookup, no
      // separator-agnostic comparison exists in findCodeFile).
      const relativePath = path.relative(projectRoot, request.path).replace(/\\/g, '/');
      recordCodingEditHistory(projectRoot, `Applied ${count} edit${count === 1 ? '' : 's'} to ${relativePath}`, [relativePath], {
        planId: request.planId,
      });
    }

    return { ok: true, data: { ...data, syntaxChecked } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return recoverByRetry(request, result, (r) => this.execute(r));
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'applyCodeEdit') return 'Working on that…';
    return `Applying an edit to ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'applyCodeEdit') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `This will change ${path.basename(request.path)}. Should I apply it?`;
      }
      return describeFailure(result);
    }
    const data = result.data as { hunksApplied: number } | undefined;
    const count = data?.hunksApplied ?? 1;
    return `I've applied ${count} edit${count === 1 ? '' : 's'} to ${path.basename(request.path)}.`;
  }
}

export const applyCodeEditPlugin = new ApplyCodeEditPlugin();
