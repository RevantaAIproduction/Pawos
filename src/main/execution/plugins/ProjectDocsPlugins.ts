import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { describeResult, writableFiles, type DocGenerationResult } from '../../../shared/docs';
import { resolveDocPath, runProjectDocs } from '../docs/projectDocs';
import { onFileCreated, onFileModified } from '../../memory/entities/fileEntities';

/** What the model and the user see of a plan: per-file actions and reasons, a short preview, no full bodies. */
function planView(result: DocGenerationResult, changes: { path: string; kind: string }[]) {
  return {
    ok: result.ok,
    summary: result.summary,
    evidence: result.evidence,
    changes,
    files: result.files.map((f) => ({
      path: f.path,
      doc: f.doc,
      category: f.category,
      action: f.action,
      reason: f.reason,
      conflicts: f.conflicts,
      uncertain: f.uncertain,
      problems: f.problems,
      preview: f.content ? f.content.slice(0, 1200) : undefined,
    })),
    writable: writableFiles(result).map((f) => f.path),
    notApplicable: result.notApplicable,
    warnings: result.warnings,
  };
}

function rootMissing(request: ActionRequest) {
  if ((request.type !== 'planProjectDocs' && request.type !== 'writeProjectDocs') || fs.existsSync(request.rootPath)) return [];
  return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project should I document?` }];
}

/**
 * Read-only: works out which documentation files to create or update from the project's real source
 * (and, with `sync`, from the files this task changed), and why. Writes nothing — available in Paw Go.
 */
export class PlanProjectDocsPlugin extends BasePlugin {
  id = 'planProjectDocs';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'planProjectDocs';
  }

  requirements(request: ActionRequest) {
    return rootMissing(request);
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'planProjectDocs') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const { result, changes } = await runProjectDocs(request);
      return { ok: true, data: planView(result, changes) };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `I couldn't analyse the project for documentation: ${(error as Error).message}` };
    }
  }

  describeInProgress(): string {
    return 'Reading the project to plan its documentation…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as ReturnType<typeof planView> | undefined;
    if (!data) return 'Done.';
    const n = data.writable.length;
    return n === 0 ? 'The documentation is already up to date — nothing to write.' : `${n} documentation file${n === 1 ? '' : 's'} to create or update — I'll ask before writing them.`;
  }
}

/**
 * Writes documentation files — only the `paths` the user approved, and only those the engine, run
 * again now on the current source, still says to create or update (a file edited since the plan is
 * re-merged, a hand-edited section is kept, a file that failed validation is never written). The
 * content always comes from the engine, never from the model. Destructive (approved in chat) and
 * Pro-gated like writeFile; the change ledger records each file under the same task.
 */
export class WriteProjectDocsPlugin extends BasePlugin {
  id = 'writeProjectDocs';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'writeProjectDocs';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'writeProjectDocs') return [];
    if (!Array.isArray(request.paths) || request.paths.length === 0) return [{ id: 'no-paths', message: 'Which documentation files should I write? Plan them first with plan_project_docs.' }];
    return rootMissing(request);
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'writeProjectDocs') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const wanted = new Set(request.paths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')));
    let result: DocGenerationResult;
    try {
      ({ result } = await runProjectDocs(request));
    } catch (error) {
      return { ok: false, reason: 'failed', message: `I couldn't generate the documentation: ${(error as Error).message}` };
    }
    const writable = writableFiles(result);
    const written: { path: string; created: boolean }[] = [];
    const notWritten: { path: string; reason: string }[] = [];
    for (const rel of wanted) {
      const file = writable.find((f) => f.path === rel);
      if (!file) {
        const outcome = result.files.find((f) => f.path === rel);
        notWritten.push({ path: rel, reason: outcome ? `${outcome.action}: ${outcome.reason}` : 'not part of the documentation plan' });
        continue;
      }
      const abs = resolveDocPath(request.rootPath, rel);
      if (!abs) {
        notWritten.push({ path: rel, reason: 'outside the project folder' });
        continue;
      }
      try {
        const existed = fs.existsSync(abs);
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, file.content, 'utf-8');
        if ((await fs.promises.readFile(abs, 'utf-8')) !== file.content) throw new Error('the written content did not match');
        if (existed) onFileModified(abs);
        else onFileCreated(abs);
        written.push({ path: rel, created: !existed });
      } catch (error) {
        notWritten.push({ path: rel, reason: (error as Error).message });
      }
    }
    const data = { written, notWritten, summary: describeResult(result), warnings: result.warnings };
    if (written.length === 0 && notWritten.length > 0) return { ok: false, reason: 'failed', message: `No documentation was written: ${notWritten.map((n) => `${n.path} (${n.reason})`).join('; ')}`, data };
    return { ok: true, data };
  }

  describeInProgress(request: ActionRequest): string {
    return request.type === 'writeProjectDocs' ? `Writing ${request.paths.length} documentation file${request.paths.length === 1 ? '' : 's'}…` : 'Writing documentation…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    const data = result.data as { written: { path: string; created: boolean }[]; notWritten: { path: string; reason: string }[] } | undefined;
    if (!result.ok) return describeFailure(result);
    if (!data) return 'Done.';
    const parts = [`I wrote ${data.written.length} documentation file${data.written.length === 1 ? '' : 's'}: ${data.written.map((w) => `${w.path}${w.created ? ' (new)' : ''}`).join(', ')}.`];
    if (data.notWritten.length > 0) parts.push(`Not written: ${data.notWritten.map((n) => `${n.path} (${n.reason})`).join('; ')}.`);
    return parts.join(' ');
  }
}

export const planProjectDocsPlugin = new PlanProjectDocsPlugin();
export const writeProjectDocsPlugin = new WriteProjectDocsPlugin();
