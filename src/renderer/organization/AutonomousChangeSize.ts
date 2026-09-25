import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

/**
 * The size of the change a run delivered — what a completed ticket is priced by. Files: distinct
 * paths the run changed (diff evidence plus successful file operations). Lines: per file, the larger
 * of lines added or removed (so editing one line counts 1, not 2), from the latest diff of that file.
 */
export function measureChangeSize(record: ExecutionRecord | null): { filesChanged: number; linesChanged: number } {
  if (!record) return { filesChanged: 0, linesChanged: 0 };
  const latestByPath = new Map<string, { at: number; lines: number }>();
  for (const diff of record.diffEvidence ?? []) {
    for (const file of diff.filesChanged ?? []) {
      const key = file.path.replace(/\\/g, '/').toLowerCase();
      const lines = Math.max(file.added ?? 0, file.deleted ?? 0);
      const prev = latestByPath.get(key);
      if (!prev || diff.timestamp >= prev.at) latestByPath.set(key, { at: diff.timestamp, lines });
    }
  }
  const paths = new Set(latestByPath.keys());
  // The git diff already covers every change in the run's worktree; the file log (which may hold
  // absolute paths) is only the fallback when no diff was captured, so a file is never counted twice.
  if (paths.size === 0) {
    for (const file of record.fileEvidence ?? []) {
      if (file.result !== 'completed') continue;
      paths.add((file.relativePath ?? file.path).replace(/\\/g, '/').toLowerCase());
    }
  }
  let linesChanged = 0;
  for (const entry of latestByPath.values()) linesChanged += entry.lines;
  return { filesChanged: paths.size, linesChanged };
}
