import * as fs from 'fs';
import * as path from 'path';
import { hashFile } from './hashUtils';

export type ConflictPolicy = 'skip' | 'overwrite' | 'rename';

/**
 * Recursive copy-with-verify — the one implementation shared by
 * CopyPathPlugin, DuplicatePathPlugin, MergeFoldersPlugin, and
 * MovePathPlugin's cross-volume (EXDEV) fallback, instead of four
 * near-identical one-off copy loops.
 */
export async function copyWithVerify(from: string, to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.cp(from, to, { recursive: true });
  const fromStat = await fs.promises.stat(from);
  if (fromStat.isFile()) {
    const toStat = await fs.promises.stat(to);
    if (toStat.size !== fromStat.size) {
      throw new Error(`Copy verification failed: size mismatch (${fromStat.size} vs ${toStat.size}).`);
    }
    if (fromStat.size < 20_000_000) {
      const [fromHash, toHash] = await Promise.all([hashFile(from), hashFile(to)]);
      if (fromHash !== toHash) throw new Error('Copy verification failed: content hash mismatch.');
    }
  }
}

/** Finds a free "name (copy N).ext" style path that doesn't collide with anything on disk. */
export async function findFreeCopyName(originalPath: string): Promise<string> {
  const dir = path.dirname(originalPath);
  const ext = path.extname(originalPath);
  const base = path.basename(originalPath, ext);
  let candidate = path.join(dir, `${base} (copy)${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (copy ${n})${ext}`);
    n += 1;
  }
  return candidate;
}

/** Recursively merges `from` into `to`, applying a per-entry conflict policy. Returns the list of destination paths written. */
export async function mergeInto(from: string, to: string, onConflict: ConflictPolicy): Promise<string[]> {
  const written: string[] = [];

  async function walk(src: string, dest: string) {
    const stat = await fs.promises.stat(src);
    if (stat.isDirectory()) {
      await fs.promises.mkdir(dest, { recursive: true });
      const entries = await fs.promises.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        await walk(path.join(src, entry.name), path.join(dest, entry.name));
      }
      return;
    }

    let target = dest;
    if (fs.existsSync(target)) {
      if (onConflict === 'skip') return;
      if (onConflict === 'rename') target = await findFreeCopyName(target);
      // 'overwrite' falls through and copies onto `target` as-is.
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(src, target);
    written.push(target);
  }

  await walk(from, to);
  return written;
}
