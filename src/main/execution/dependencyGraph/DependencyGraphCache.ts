import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { DependencyGraphBuildResult, PreviousDependencyGraph } from './DependencyGraphBuilder';

const FILE_NAME = 'dependency-graph-cache.json';

export type DependencyGraphRecord = {
  root: string;
  builtAt: number;
  fileHashes: Record<string, number>;
  edges: Record<string, string[]>;
  exports: Record<string, string[]>;
};

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).toLowerCase();
}

/**
 * Same persistence shape as WorkspaceMemoryStore (one JSON file under app.getPath('userData'),
 * loaded once, saved on every mutation) — justified as a new, dedicated store rather than folded
 * into MemoryGraphStore because import edges are bulk, mechanically-regenerable, evidence-free data
 * at file-count scale (thousands of edges for a mid-size project), with no per-edge
 * confidence/provenance narrative worth MemoryGraphStore's whole-file-in-memory entity model. See
 * the Coding Runtime V2 architecture doc, §5 (Context Understanding Engine).
 */
class DependencyGraphCache {
  private filePath = '';
  private graphs = new Map<string, DependencyGraphRecord>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const records: DependencyGraphRecord[] = Array.isArray(parsed.graphs) ? parsed.graphs : [];
      this.graphs = new Map(records.map((r) => [normalizeRoot(r.root), r]));
    } catch {
      this.graphs = new Map();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ graphs: [...this.graphs.values()] }, null, 2), 'utf-8');
  }

  get(rootPath: string): DependencyGraphRecord | undefined {
    return this.graphs.get(normalizeRoot(rootPath));
  }

  /** What DependencyGraphBuilder.buildDependencyGraph() should pass as `previous` for an incremental rebuild — undefined for a project never built before. */
  getPrevious(rootPath: string): PreviousDependencyGraph | undefined {
    const record = this.get(rootPath);
    if (!record) return undefined;
    return { fileHashes: record.fileHashes, edges: record.edges, exports: record.exports };
  }

  store(rootPath: string, result: DependencyGraphBuildResult): DependencyGraphRecord {
    const record: DependencyGraphRecord = {
      root: rootPath,
      builtAt: Date.now(),
      fileHashes: result.fileHashes,
      edges: result.edges,
      exports: result.exports,
    };
    this.graphs.set(normalizeRoot(rootPath), record);
    this.save();
    return record;
  }

  /** Importers of a given file (relative path) — the reverse-edge lookup Intelligent File Discovery (Phase 3) will need; built here since the forward edges are already in memory. */
  getImporters(rootPath: string, relativeFilePath: string): string[] {
    const record = this.get(rootPath);
    if (!record) return [];
    const importers: string[] = [];
    for (const [file, imports] of Object.entries(record.edges)) {
      if (imports.includes(relativeFilePath)) importers.push(file);
    }
    return importers;
  }
}

export const dependencyGraphCache = new DependencyGraphCache();
