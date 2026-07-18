import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { hashFile, partialHashFile } from './hashUtils';
import { observationEngine } from '../../memory/ObservationEngine';

const MAX_FILES_SCANNED = 3000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);

async function collectFiles(root: string): Promise<{ path: string; size: number }[]> {
  const files: { path: string; size: number }[] = [];
  async function walk(dir: string, depth: number) {
    if (files.length >= MAX_FILES_SCANNED || depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES_SCANNED) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
        continue;
      }
      try {
        const stat = await fs.promises.stat(full);
        if (stat.size > 0) files.push({ path: full, size: stat.size });
      } catch {
        // unreadable — skip
      }
    }
  }
  await walk(root, 0);
  return files;
}

/**
 * duplicateClusterObserver — size-bucket -> partial-hash for ranking/
 * speed, but a FULL hash tie is required before ever suggesting a file
 * for deletion specifically ("never assume"). Produces Observations
 * (disposable insights), never writes into the Memory Graph — finding
 * duplicates is an opinion about the user's files, not a fact about them.
 */
export class FindDuplicateFilesPlugin extends BasePlugin {
  id = 'findDuplicateFiles';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'findDuplicateFiles';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'findDuplicateFiles') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const files = await collectFiles(request.rootPath);

      const bySize = new Map<number, string[]>();
      for (const f of files) {
        const bucket = bySize.get(f.size);
        if (bucket) bucket.push(f.path);
        else bySize.set(f.size, [f.path]);
      }
      const sizeCandidates = [...bySize.values()].filter((group) => group.length > 1);

      const byPartialHash = new Map<string, string[]>();
      for (const group of sizeCandidates) {
        for (const filePath of group) {
          const partial = await partialHashFile(filePath);
          const bucket = byPartialHash.get(partial);
          if (bucket) bucket.push(filePath);
          else byPartialHash.set(partial, [filePath]);
        }
      }
      const partialCandidates = [...byPartialHash.values()].filter((group) => group.length > 1);

      const confirmedGroups: string[][] = [];
      for (const group of partialCandidates) {
        const byFullHash = new Map<string, string[]>();
        for (const filePath of group) {
          const full = await hashFile(filePath);
          const bucket = byFullHash.get(full);
          if (bucket) bucket.push(filePath);
          else byFullHash.set(full, [filePath]);
        }
        for (const confirmed of byFullHash.values()) {
          if (confirmed.length > 1) confirmedGroups.push(confirmed);
        }
      }

      const observations = observationEngine.replaceKind(
        `duplicates:${request.rootPath}`,
        confirmedGroups.map((group) => ({
          kind: 'duplicates',
          text: `${group.length} identical copies found: ${group.map((p) => path.basename(p)).join(', ')}.`,
          entityRefs: group,
          basis: [{ source: 'fileContent', detail: 'Full SHA-256 content hash matched across every file in this group.' }],
        }))
      );

      return { ok: true, data: { groups: confirmedGroups, observationCount: observations.length } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Looking for duplicate files…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'findDuplicateFiles') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { groups?: string[][] } | undefined;
    const count = data?.groups?.length ?? 0;
    return count === 0 ? "I didn't find any duplicate files." : `Found ${count} group${count === 1 ? '' : 's'} of duplicate files.`;
  }
}

export const findDuplicateFilesPlugin = new FindDuplicateFilesPlugin();
