import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { findFileEntityByPath, type FileAttributes } from '../../memory/entities/fileEntities';
import { classifyAndIndexFile } from './fileClassifier';

const LIVE_SCAN_BUDGET = 30;
const INDEXABLE_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);

async function collectUnindexedCandidates(root: string, budget: number): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number) {
    if (found.length >= budget || depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= budget) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
        continue;
      }
      if (INDEXABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && !findFileEntityByPath(full)) {
        found.push(full);
      }
    }
  }
  await walk(root, 0);
  return found;
}

type Match = { path: string; docType: string; summary: string; reason: string; confidence: number };

/**
 * Semantic file search — checks the graph's indexed classifications
 * first; for unindexed files still in scope, classifies just those (up to
 * a small per-query budget) and persists the result, so repeated queries
 * get progressively cheaper. This is what makes "find my resume" match
 * CV.docx/Curriculum Vitae.docx and "the proposal for ABC Industries"
 * match a file whose mentions.clients contains that name, regardless of
 * filename.
 */
export class FindFileSemanticPlugin extends BasePlugin {
  id = 'findFileSemantic';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'findFileSemantic';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'findFileSemantic') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const unindexed = await collectUnindexedCandidates(request.rootPath, LIVE_SCAN_BUDGET);
      for (const candidate of unindexed) {
        await classifyAndIndexFile(candidate);
      }

      const target = request.rootPath.toLowerCase();
      const candidates = memoryGraphStore
        .queryEntities({ type: 'file' })
        .filter((e) => (e.attributes as FileAttributes).path.toLowerCase().startsWith(target));

      const questionLower = request.question.toLowerCase();
      const docTypeHint = request.docType?.toLowerCase();
      const clientHint = request.client?.toLowerCase();

      const matches: Match[] = [];
      for (const entity of candidates) {
        const attrs = entity.attributes as FileAttributes;
        const reasons: string[] = [];
        let confidence = 0;

        if (docTypeHint && attrs.docType.toLowerCase() === docTypeHint) {
          reasons.push(`classified as ${attrs.docType}`);
          confidence = Math.max(confidence, 0.9);
        }
        if (clientHint && attrs.mentions.clients.some((c) => c.toLowerCase().includes(clientHint))) {
          reasons.push(`mentions client "${request.client}"`);
          confidence = Math.max(confidence, 0.85);
        }
        if (attrs.tags.some((t) => questionLower.includes(t.toLowerCase()))) {
          reasons.push('tag matches your question');
          confidence = Math.max(confidence, 0.6);
        }
        if (attrs.summary && questionLower.split(/\s+/).some((word) => word.length > 3 && attrs.summary.toLowerCase().includes(word))) {
          reasons.push('summary matches your question');
          confidence = Math.max(confidence, 0.5);
        }
        if (path.basename(attrs.path).toLowerCase().includes(questionLower.replace(/[^a-z0-9]/gi, ''))) {
          reasons.push('filename matches');
          confidence = Math.max(confidence, 0.4);
        }

        if (reasons.length > 0) {
          matches.push({ path: attrs.path, docType: attrs.docType, summary: attrs.summary, reason: reasons.join(', '), confidence });
        }
      }

      matches.sort((a, b) => b.confidence - a.confidence);
      return { ok: true, data: { matches: matches.slice(0, 20) } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Looking through your files…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'findFileSemantic') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { matches?: Match[] } | undefined;
    const count = data?.matches?.length ?? 0;
    return count === 0 ? "I didn't find anything matching that." : `Found ${count} match${count === 1 ? '' : 'es'}.`;
  }
}

export const findFileSemanticPlugin = new FindFileSemanticPlugin();
