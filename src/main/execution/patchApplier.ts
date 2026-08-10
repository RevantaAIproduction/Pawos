import { applyPatch } from 'diff';
import type { CodeEditHunk } from '../../shared/actions/ActionTypes';

export type PatchApplyResult = { ok: true; newContent: string } | { ok: false; message: string };

/** Locates `block` as a contiguous, exact-match run of lines within `lines`, searching from `searchFrom` onward — never wraps or searches backward, so hunks provided out of order fail honestly rather than landing at the wrong occurrence. */
function findBlock(lines: string[], block: string[], searchFrom: number): number {
  outer: for (let i = searchFrom; i <= lines.length - block.length; i += 1) {
    for (let j = 0; j < block.length; j += 1) {
      if (lines[i + j] !== block[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Converts a batch of CodeEditHunks into a real unified-diff string against `originalContent`, then
 * applies it via the `diff` package's own `applyPatch()` — never a hand-rolled substring splice (see
 * Coding Runtime V2 §10). For each hunk, `contextBefore + oldLines` is located as an exact match
 * starting after the previous hunk's match (hunks must be given in ascending file order); the
 * resulting `@@ -a,b +c,d @@` line numbers are computed from that real position plus the cumulative
 * line-count delta of every earlier hunk in this same batch. `contextAfter` is not re-verified here —
 * `applyPatch()` itself checks it as part of the patch's context (with zero fuzz by default), so a
 * mismatched `contextAfter` still fails honestly rather than silently applying.
 */
export function applyCodeEditHunks(originalContent: string, hunks: CodeEditHunk[]): PatchApplyResult {
  if (hunks.length === 0) return { ok: false, message: 'No edits were provided.' };

  const originalLines = originalContent.split('\n');
  const patchLines: string[] = ['--- a/file', '+++ b/file'];
  let searchFrom = 0;
  let lineOffset = 0;

  for (const hunk of hunks) {
    const anchor = [...hunk.contextBefore, ...hunk.oldLines];
    if (anchor.length === 0) {
      return { ok: false, message: 'One of the edits had no surrounding context or old lines to anchor its location — at least one is required.' };
    }
    const idx = findBlock(originalLines, anchor, searchFrom);
    if (idx === -1) {
      return { ok: false, message: "Couldn't find the expected surrounding lines for one of the edits in the current file content — it may have changed since this edit was written." };
    }

    const oldStart = idx + 1;
    const oldCount = hunk.contextBefore.length + hunk.oldLines.length + hunk.contextAfter.length;
    const newStart = oldStart + lineOffset;
    const newCount = hunk.contextBefore.length + hunk.newLines.length + hunk.contextAfter.length;

    patchLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const line of hunk.contextBefore) patchLines.push(` ${line}`);
    for (const line of hunk.oldLines) patchLines.push(`-${line}`);
    for (const line of hunk.newLines) patchLines.push(`+${line}`);
    for (const line of hunk.contextAfter) patchLines.push(` ${line}`);

    lineOffset += hunk.newLines.length - hunk.oldLines.length;
    searchFrom = idx + anchor.length;
  }

  const patched = applyPatch(originalContent, `${patchLines.join('\n')}\n`);
  if (patched === false) {
    return { ok: false, message: "The patch didn't apply cleanly — the file's current content doesn't exactly match what this edit expected." };
  }
  return { ok: true, newContent: patched };
}
