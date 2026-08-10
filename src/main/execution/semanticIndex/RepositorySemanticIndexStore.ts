import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { RepositorySemanticIndex } from './RepositorySemanticIndexTypes';

const FILE_NAME = 'repository-semantic-index.json';

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).toLowerCase();
}

/**
 * Same persistence shape as `DependencyGraphCache`/`WorkspaceMemoryStore` (one JSON file under
 * `app.getPath('userData')`, loaded once, saved on every mutation) — justified as a new, dedicated
 * store rather than folded into `MemoryGraphStore` for the same reason `DependencyGraphCache` is:
 * the Index is bulk, mechanically-regenerable, disposable composition data, not narrative Memory
 * Graph evidence. See the Coding Runtime V2 architecture doc, §7 (Repository Semantic Index).
 */
class RepositorySemanticIndexStore {
  private filePath = '';
  private indexes = new Map<string, RepositorySemanticIndex>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const records: RepositorySemanticIndex[] = Array.isArray(parsed.indexes) ? parsed.indexes : [];
      this.indexes = new Map(records.map((r) => [normalizeRoot(r.root), r]));
    } catch {
      this.indexes = new Map();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ indexes: [...this.indexes.values()] }, null, 2), 'utf-8');
  }

  get(rootPath: string): RepositorySemanticIndex | undefined {
    return this.indexes.get(normalizeRoot(rootPath));
  }

  store(rootPath: string, index: RepositorySemanticIndex): RepositorySemanticIndex {
    this.indexes.set(normalizeRoot(rootPath), index);
    this.save();
    return index;
  }
}

export const repositorySemanticIndexStore = new RepositorySemanticIndexStore();
