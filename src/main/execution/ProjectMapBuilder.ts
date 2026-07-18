import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const MAX_DEPTH = 6;
const MAX_NODES = 300;
const COMMON_ENTRY_CANDIDATES = ['index.ts', 'index.js', 'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js', 'main.ts', 'main.js'];

export type ProjectFileTreeNode = { name: string; type: 'file' | 'directory'; children?: ProjectFileTreeNode[] };

export type ProjectMap = {
  root: string;
  fileTree: ProjectFileTreeNode[];
  truncated: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  entryPoint: string | null;
};

function readPackageJson(root: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function resolveEntryPoint(root: string, pkg: Record<string, any> | null): string | null {
  const declared = pkg?.main || pkg?.module;
  if (typeof declared === 'string' && fs.existsSync(path.join(root, declared))) return declared;
  for (const candidate of COMMON_ENTRY_CANDIDATES) {
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }
  return null;
}

/** Bounded directory walk (same SKIP_DIRS/depth-cap convention as IndexWorkspacePlugin/SearchFilesPlugin) — an overview tree for Project Understanding, never a full listing of a large repo. */
function buildFileTree(root: string): { tree: ProjectFileTreeNode[]; truncated: boolean } {
  let nodeCount = 0;
  let truncated = false;

  function walk(dir: string, depth: number): ProjectFileTreeNode[] {
    if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) {
      truncated = true;
      return [];
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: ProjectFileTreeNode[] = [];
    for (const entry of entries) {
      if (nodeCount >= MAX_NODES) {
        truncated = true;
        break;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        nodeCount += 1;
        nodes.push({ name: entry.name, type: 'directory', children: walk(path.join(dir, entry.name), depth + 1) });
      } else {
        nodeCount += 1;
        nodes.push({ name: entry.name, type: 'file' });
      }
    }
    return nodes;
  }

  const tree = walk(root, 0);
  return { tree, truncated };
}

/**
 * Real data only — a shallow directory tree (bounded, node_modules/.git/dist
 * excluded), the actual `dependencies`/`devDependencies` from package.json
 * (parsed but previously discarded by ProjectAnalyzer.ts, which only kept
 * `scripts`), and a best-effort entry-point resolution. No structural
 * guessing beyond what's actually on disk.
 */
export function buildProjectMap(root: string): ProjectMap {
  const pkg = readPackageJson(root);
  const { tree, truncated } = buildFileTree(root);
  return {
    root,
    fileTree: tree,
    truncated,
    dependencies: pkg?.dependencies ?? {},
    devDependencies: pkg?.devDependencies ?? {},
    entryPoint: resolveEntryPoint(root, pkg),
  };
}
