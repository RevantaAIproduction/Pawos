import * as fs from 'fs';
import * as path from 'path';

const MAX_ANCESTOR_DEPTH = 25;

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — walks up from a file's directory looking for the
 * nearest `package.json`, the same real, deterministic marker `ProjectAnalyzer` already treats as
 * authoritative for "this is a project root." Reused here so an edit-applying action (whose
 * ActionRequest carries only an absolute file path, not a `rootPath` — `applyCodeEdit`'s frozen
 * Phase 7 shape) can attribute a file to its owning project without guessing: every real edit
 * happens inside a project the model has already been analyzing, so a `package.json` ancestor is
 * real evidence, not a fabricated root. Returns `null`, never an invented path, when no
 * `package.json` is found before the filesystem root or the depth cap.
 */
export function findProjectRootFor(filePath: string): string | null {
  let dir = path.dirname(path.resolve(filePath));
  for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
