/**
 * Per-task file changes (the "change ledger"), captured by the main process at the real file
 * operation boundary (applyCodeEdit, writeFile, deletePath, movePath) — see
 * src/main/execution/codeChanges/CodeChangeLedger.ts. Every diff compares the file as it was
 * before the task first touched it (baseline) with how it is now (final): repeated edits collapse
 * into one net change, and a file put back exactly as it was shows no change.
 *
 * Whole-file writes: diffs come from real before/after snapshots of each write, never from the
 * model's output stream.
 */

/** Why a snapshot's content is not shown (its metadata and hash are still recorded). */
export type SnapshotHiddenReason = 'secret' | 'binary' | 'too_large' | 'directory' | 'symlink' | 'unreadable';

export type FileSnapshotRef = {
  exists: boolean;
  /** sha256 of the content; null when missing, a directory, a symlink, unreadable, or too large to hash. */
  hash: string | null;
  size: number | null;
  /** 'stored': content kept (content-addressed) and diffable. 'hidden': not stored — see hiddenReason. */
  content: 'stored' | 'hidden' | 'none';
  hiddenReason?: SnapshotHiddenReason;
};

/** The net state of one file in one task, baseline → final. */
export type CodeChangeStatus = 'created' | 'modified' | 'deleted' | 'renamed' | 'unchanged';

export type CodeChangeOperation = 'write' | 'edit' | 'delete' | 'move' | 'revert';

export type CodeChangeEntry = {
  /** Current path, relative to the project root, forward slashes. */
  path: string;
  /** Where the baseline was taken (differs from `path` after a rename/move). */
  originalPath: string;
  baseline: FileSnapshotRef;
  final: FileSnapshotRef;
  status: CodeChangeStatus;
  /** Net added / removed lines baseline → final; null when content is hidden. */
  added: number | null;
  removed: number | null;
  lastSeq: number;
  updatedAt: number;
  /** Set once this file's task change was reverted by the user. */
  revertedAt?: number;
};

export type CodeChangeEvent = {
  executionId: string;
  /** Strictly increasing per execution — consumers apply an event only if seq > the last they saw. */
  seq: number;
  at: number;
  operation: CodeChangeOperation;
  actionType: string;
  path: string;
  previousPath?: string;
  result: 'completed' | 'failed' | 'cancelled';
  /** The entry's net state after this operation (no content). */
  entry: CodeChangeEntry | null;
};

export type CodeChangeLedger = {
  executionId: string;
  /** The signed-in account when the task ran; another account cannot read or revert it. */
  accountId: string | null;
  /** Real path of the project root the paths are relative to. */
  projectRoot: string;
  createdAt: number;
  updatedAt: number;
  seq: number;
  entries: CodeChangeEntry[];
  /** Most recent events, oldest first (capped). */
  events: CodeChangeEvent[];
  /**
   * Commands/builds ran during this task. Files they changed (formatters, codegen, installs) are
   * NOT attributed to the task — the ledger only covers PawOS's own file operations.
   */
  untrackedCommandCount: number;
};

/** A ledger without event history — what lists and live updates carry. */
export type CodeChangeSummary = Omit<CodeChangeLedger, 'events'> & {
  totals: { files: number; added: number; removed: number; created: number; modified: number; deleted: number; renamed: number };
};

export type DiffLineKind = 'context' | 'add' | 'remove';
export type DiffLine = { kind: DiffLineKind; text: string; oldLine: number | null; newLine: number | null };
export type DiffHunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };

export type CodeChangeDiff =
  | {
      ok: true;
      path: string;
      originalPath: string;
      status: CodeChangeStatus;
      hunks: DiffHunk[];
      added: number;
      removed: number;
      /** The file is longer than the diff limit — only the first part was compared. */
      truncated: boolean;
    }
  | { ok: false; path: string; status: CodeChangeStatus | null; reason: 'not_found' | 'hidden' | 'too_large' | 'forbidden'; hiddenReason?: SnapshotHiddenReason; message: string };

export type CodeChangeRevertResult =
  | { ok: true; path: string; restored: 'content' | 'removed' | 'moved_back'; event: CodeChangeEvent }
  | {
      ok: false;
      path: string;
      reason: 'not_found' | 'forbidden' | 'conflict' | 'not_revertible' | 'already_reverted' | 'failed';
      message: string;
    };

/** Whether a file's task change can be reverted, and if not, why — for disabling the control honestly. */
export function revertAvailability(entry: CodeChangeEntry): { ok: true } | { ok: false; message: string } {
  if (entry.revertedAt) return { ok: false, message: 'Already reverted.' };
  if (entry.status === 'unchanged') return { ok: false, message: 'Nothing to revert — the file is back as it was.' };
  if (entry.baseline.content === 'hidden' || entry.final.content === 'hidden') {
    const reason = entry.baseline.hiddenReason ?? entry.final.hiddenReason;
    return {
      ok: false,
      message:
        reason === 'secret'
          ? "PawOS doesn't keep copies of secret files, so this change can't be reverted here."
          : reason === 'directory'
            ? 'Folder operations are recorded but their contents are not, so they can’t be reverted here.'
            : 'This file’s content wasn’t captured (binary, too large or unreadable), so it can’t be reverted here.',
    };
  }
  return { ok: true };
}
