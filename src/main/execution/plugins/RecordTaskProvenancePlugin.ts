import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { RELATION } from '../../memory/relationVocabulary';
import { findFileEntityByPath } from '../../memory/entities/fileEntities';

type TaskAction = { request: ActionRequest; result: ActionResult };

/** The output path a write-shaped action touched, once it succeeded. */
function writtenPath(request: ActionRequest, result: ActionResult): string | undefined {
  if (!result.ok) return undefined;
  switch (request.type) {
    case 'writeFile':
    case 'createFolder':
      return request.path;
    case 'movePath':
    case 'copyPath':
    case 'compressPath':
    case 'extractArchive':
    case 'mergeFolders':
      return request.to;
    case 'downloadBrowserFile':
    case 'printBrowserPageToPdf':
      return request.savePath;
    case 'duplicatePath': {
      const data = result.data as { to?: string } | undefined;
      return data?.to;
    }
    default:
      return undefined;
  }
}

/** The path a read-shaped action pulled content from, once it succeeded — used to build DERIVED_FROM/USES edges for anything written later in the same task. */
function readPath(request: ActionRequest, result: ActionResult): string | undefined {
  if (!result.ok) return undefined;
  if (request.type === 'readFile') return request.path;
  return undefined;
}

/**
 * Called once per finalized Task Card (one user goal). Walks the SAME
 * ordered action list the Task Card already tracked — no separate
 * tracking machinery — to link newly-created/modified files to the
 * workspace, the conversation, and whichever files were genuinely read
 * earlier in the same task. Every edge here is structural evidence
 * (chronological order, shared task/workspace), never an LLM claim, so
 * there's nothing to verify against source content — the linking code IS
 * the evidence.
 */
export class RecordTaskProvenancePlugin extends BasePlugin {
  id = 'recordTaskProvenance';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordTaskProvenance';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordTaskProvenance') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const conversationEntity = memoryGraphStore.upsertEntity(
        'conversation',
        { goal: request.goal, conversationId: request.conversationId },
        { changeType: 'created' }
      );

      const readSoFar: string[] = [];
      let linked = 0;

      for (const action of request.actions as TaskAction[]) {
        const rp = readPath(action.request, action.result);
        if (rp) readSoFar.push(rp);

        const wp = writtenPath(action.request, action.result);
        if (!wp) continue;

        const fileEntity = findFileEntityByPath(wp);
        if (!fileEntity) continue;

        memoryGraphStore.link(fileEntity.id, conversationEntity.id, RELATION.GENERATED_FROM, {
          confidence: 1,
          evidence: [{ source: 'taskExecution', detail: `Created while working on: "${request.goal}"` }],
          reasoningSummary: `Generated from this task because it was created while working on "${request.goal}".`,
        });
        linked += 1;

        // BELONGS_TO is deliberately NOT re-created here — fileEntities.ts's
        // onFileCreated/onFileModified/onFileMoved/onFileRenamed hooks
        // already own workspace membership precisely (supersede-old-then-
        // create-new), and every writtenPath() above went through one of
        // those hooks already. Re-linking here would create a duplicate
        // active edge alongside the one those hooks already made.

        for (const sourcePath of readSoFar) {
          if (sourcePath === wp) continue;
          const sourceEntity = findFileEntityByPath(sourcePath);
          if (!sourceEntity) continue;
          memoryGraphStore.link(fileEntity.id, sourceEntity.id, RELATION.DERIVED_FROM, {
            confidence: 1,
            evidence: [{ source: 'taskExecution', detail: `This task also read "${sourcePath}" earlier, before writing this file.` }],
            reasoningSummary: `Derived from this file because it was read earlier in the same task, before this file was written.`,
          });
        }
      }

      return { ok: true, data: { linked } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Updating my memory of this…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordTaskProvenance') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return "I've updated my memory of this work.";
  }
}

export const recordTaskProvenancePlugin = new RecordTaskProvenancePlugin();
