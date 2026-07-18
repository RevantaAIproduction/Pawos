import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { copyWithVerify } from './pathCopy';

const INDEX_FILE_NAME = 'trash-index.json';
const TRASH_DIR_NAME = 'trash';

type TrashItem = {
  id: string;
  originalPath: string;
  trashPath: string;
  deletedAt: number;
  restoredAt: number | null;
};

function normalize(p: string): string {
  return path.resolve(p).toLowerCase();
}

/**
 * Paw-managed trash — a staging folder under userData plus a small JSON
 * index (same store pattern as WorkspaceMemoryStore), used instead of the
 * real Windows Shell Recycle Bin because programmatic *restore* through the
 * real Recycle Bin needs fragile COM Shell Automation path-matching. This
 * gives 100% reliable restore at the cost of not showing up in Explorer's
 * Recycle Bin — `permanent: true` on deletePath still does a real delete
 * for cases where that's explicitly wanted.
 */
class TrashStore {
  private indexPath = '';
  private trashDir = '';
  private items = new Map<string, TrashItem>();

  init(): void {
    this.indexPath = path.join(app.getPath('userData'), INDEX_FILE_NAME);
    this.trashDir = path.join(app.getPath('userData'), TRASH_DIR_NAME);
    fs.mkdirSync(this.trashDir, { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const records: TrashItem[] = Array.isArray(parsed.items) ? parsed.items : [];
      this.items = new Map(records.map((r) => [r.id, r]));
    } catch {
      this.items = new Map();
    }
  }

  private save(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify({ items: [...this.items.values()] }, null, 2), 'utf-8');
  }

  private async moveAcrossVolumes(from: string, to: string): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      await fs.promises.rename(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyWithVerify(from, to);
      await fs.promises.rm(from, { recursive: true, force: true });
    }
  }

  /** Moves a real path into the trash staging folder. Returns the trash item id. */
  async moveToTrash(originalPath: string): Promise<string> {
    const id = uuidv4();
    const trashPath = path.join(this.trashDir, `${id}__${path.basename(originalPath)}`);
    await this.moveAcrossVolumes(originalPath, trashPath);
    this.items.set(id, { id, originalPath, trashPath, deletedAt: Date.now(), restoredAt: null });
    this.save();
    return id;
  }

  /** Restores the most recently trashed item matching this original path. Returns the restored path, or null if nothing to restore. */
  async restore(originalPath: string): Promise<string | null> {
    const target = normalize(originalPath);
    const candidates = [...this.items.values()]
      .filter((item) => item.restoredAt === null && normalize(item.originalPath) === target)
      .sort((a, b) => b.deletedAt - a.deletedAt);
    const item = candidates[0];
    if (!item) return null;

    await this.moveAcrossVolumes(item.trashPath, item.originalPath);
    item.restoredAt = Date.now();
    this.save();
    return item.originalPath;
  }

  listItems(): TrashItem[] {
    return [...this.items.values()].sort((a, b) => b.deletedAt - a.deletedAt);
  }
}

export const trashStore = new TrashStore();
