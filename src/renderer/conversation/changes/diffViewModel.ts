import type { CodeChangeDiff, CodeChangeEntry, CodeChangeStatus, DiffLine } from '../../../shared/actions/CodeChangeTypes';
import { colorLine, INITIAL_COLOR_STATE, type ColorLanguage, type ColorState, type Token } from './syntaxColorizer';

/**
 * Pure view-model for the Changes view: the changed-file list (grouped, filtered) and the rows of a
 * unified diff (line numbers, colored tokens, collapsible unchanged runs). The diff itself is
 * computed by the main process; this only arranges what it returned.
 */

export type DiffRow =
  | { kind: 'hunk'; key: string; header: string }
  | { kind: 'gap'; key: string; hidden: number; groupId: string | null; label: string }
  | { kind: 'line'; key: string; line: DiffLine; tokens: Token[] };

/** Unchanged runs longer than this are collapsed (keeping CONTEXT lines on each side). */
export const COLLAPSE_THRESHOLD = 8;
const CONTEXT = 3;
/** At most this many rows are rendered at once; the rest behind "Show more". */
export const ROW_PAGE = 1500;

type Ok = Extract<CodeChangeDiff, { ok: true }>;

/**
 * `colorLimit`: only the first N diff lines get syntax colors (the rows actually shown); the rest are
 * plain until "Show more" raises the limit. Coloring runs in order, so the shown prefix is exact.
 */
export function buildDiffRows(diff: Ok, lang: ColorLanguage, expandedGroups: ReadonlySet<string> = new Set(), colorLimit = Number.POSITIVE_INFINITY): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldState: ColorState = INITIAL_COLOR_STATE;
  let newState: ColorState = INITIAL_COLOR_STATE;
  let previousOldEnd = 1;
  let colored = 0;

  diff.hunks.forEach((hunk, hunkIndex) => {
    const skipped = hunk.oldStart - previousOldEnd;
    if (skipped > 0) rows.push({ kind: 'gap', key: `gap-${hunkIndex}`, hidden: skipped, groupId: null, label: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
    rows.push({ kind: 'hunk', key: `hunk-${hunkIndex}`, header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` });
    previousOldEnd = hunk.oldStart + hunk.oldLines;

    // Color with two state chains: removed lines follow the old file, added lines the new one.
    const tokensFor = hunk.lines.map((line) => {
      if (colored >= colorLimit) return [{ text: line.text, kind: 'plain' as const }];
      colored += 1;
      if (line.kind === 'remove') {
        const r = colorLine(line.text, lang, oldState);
        oldState = r.state;
        return r.tokens;
      }
      if (line.kind === 'add') {
        const r = colorLine(line.text, lang, newState);
        newState = r.state;
        return r.tokens;
      }
      const r = colorLine(line.text, lang, newState);
      oldState = colorLine(line.text, lang, oldState).state;
      newState = r.state;
      return r.tokens;
    });

    // Collapse long unchanged runs inside the hunk (only appear when the full file was requested).
    const items = hunk.lines.map((line, index) => ({ line, tokens: tokensFor[index] ?? [] }));
    const pushLine = (k: number) => {
      const item = items[k];
      if (item) rows.push({ kind: 'line', key: `l-${hunkIndex}-${k}`, line: item.line, tokens: item.tokens });
    };
    let i = 0;
    while (i < items.length) {
      if (items[i]?.line.kind !== 'context') {
        pushLine(i);
        i += 1;
        continue;
      }
      let end = i;
      while (end < items.length && items[end]?.line.kind === 'context') end += 1;
      const runLength = end - i;
      const keepBefore = i === 0 ? 0 : CONTEXT;
      const keepAfter = end === items.length ? 0 : CONTEXT;
      const groupId = `g-${hunkIndex}-${i}`;
      if (runLength > COLLAPSE_THRESHOLD && runLength - keepBefore - keepAfter > 0 && !expandedGroups.has(groupId)) {
        for (let k = i; k < i + keepBefore; k += 1) pushLine(k);
        const hidden = runLength - keepBefore - keepAfter;
        rows.push({ kind: 'gap', key: groupId, hidden, groupId, label: `${hidden} unchanged line${hidden === 1 ? '' : 's'}` });
        for (let k = end - keepAfter; k < end; k += 1) pushLine(k);
      } else {
        for (let k = i; k < end; k += 1) pushLine(k);
      }
      i = end;
    }
  });
  return rows;
}

/** The diff as unified-diff text (Copy diff). */
export function toUnifiedDiff(diff: Ok): string {
  const header = [`--- a/${diff.originalPath}`, `+++ b/${diff.path}`];
  const body = diff.hunks.flatMap((hunk) => [
    // Unified-diff convention: an empty range is written as the line before it.
    `@@ -${hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart},${hunk.oldLines} +${hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines.map((line) => `${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}${line.text}`),
  ]);
  return [...header, ...body].join('\n') + '\n';
}

export type FileGroup = { id: CodeChangeStatus | 'reverted'; label: string; entries: CodeChangeEntry[] };

const GROUP_ORDER: { id: FileGroup['id']; label: string }[] = [
  { id: 'created', label: 'Created' },
  { id: 'modified', label: 'Modified' },
  { id: 'renamed', label: 'Renamed' },
  { id: 'deleted', label: 'Deleted' },
  { id: 'reverted', label: 'Reverted' },
];

/** Changed files grouped by what happened to them; files back to their original state are left out unless reverted. */
export function groupChangedFiles(entries: CodeChangeEntry[], filter: string): FileGroup[] {
  const needle = filter.trim().toLowerCase();
  const matching = entries.filter((e) => !needle || e.path.toLowerCase().includes(needle) || e.originalPath.toLowerCase().includes(needle));
  const groups: FileGroup[] = [];
  for (const { id, label } of GROUP_ORDER) {
    const inGroup = matching
      .filter((e) => (id === 'reverted' ? e.status === 'unchanged' && !!e.revertedAt : e.status === id))
      .sort((a, b) => a.path.localeCompare(b.path));
    if (inGroup.length > 0) groups.push({ id, label, entries: inGroup });
  }
  return groups;
}

export function splitPath(rel: string): { name: string; dir: string } {
  const parts = rel.split('/');
  const name = parts.pop() ?? rel;
  return { name, dir: parts.join('/') };
}
