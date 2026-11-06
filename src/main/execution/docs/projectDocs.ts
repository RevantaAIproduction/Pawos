import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest } from '../../../shared/actions/ActionTypes';
import { generateDocs, isSecretPath, type DocGenerationResult, type FileChange, type GenerateDocsInput, type ProjectSnapshot } from '../../../shared/docs';
import { isSecretFile } from '../plugins/ReadFilePlugin';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import { repositorySemanticIndexService } from '../semanticIndex/RepositorySemanticIndexService';
import { codeChangeStore } from '../codeChanges/codeChangeStore';

/**
 * Desktop's adapter for the shared documentation engine (src/shared/docs): it reads the project from
 * disk into a ProjectSnapshot, adds what Desktop already knows about it (the import graph and the
 * semantic index's features, when they have been built), takes a task's real file changes from the
 * change ledger, and runs the engine. It never writes — WriteProjectDocsPlugin does, after approval.
 */

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.cache', '.vercel', '.output', 'vendor', 'target', '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'release']);
const READ_FILE = /(\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|sql|prisma|css|scss|sass|less|md|mdx|mmd|ya?ml|toml)$)|(^|\/)(package\.json|Dockerfile|Procfile|vercel\.json|components\.json|\.env\.(example|sample|template))$/;
const MAX_PATHS = 8000;
const MAX_FILES_READ = 3000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

type DocsRequest = Extract<ActionRequest, { type: 'planProjectDocs' | 'writeProjectDocs' }>;

export async function collectProjectSnapshot(rootPath: string): Promise<{ snapshot: ProjectSnapshot; existing: Record<string, string> }> {
  const root = path.resolve(rootPath);
  const allPaths: string[] = [];
  const files: { path: string; content: string }[] = [];
  const existing: Record<string, string> = {};
  let truncated = false;
  let bytes = 0;
  const queue = [''];
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) queue.push(childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (allPaths.length >= MAX_PATHS) {
        truncated = true;
        break;
      }
      allPaths.push(childRel);
      // Secret files are listed (so docs can say a .env exists) but never read.
      if (!READ_FILE.test(childRel) || isSecretPath(childRel) || isSecretFile(childRel)) continue;
      if (files.length >= MAX_FILES_READ || bytes >= MAX_TOTAL_BYTES) {
        truncated = true;
        continue;
      }
      try {
        const stat = await fs.promises.stat(path.join(root, childRel));
        if (stat.size > MAX_FILE_BYTES) {
          truncated = true;
          continue;
        }
        const content = await fs.promises.readFile(path.join(root, childRel), 'utf-8');
        bytes += content.length;
        if (/\.(md|mdx|mmd)$/i.test(childRel)) existing[childRel] = content;
        else files.push({ path: childRel, content });
      } catch {
        // unreadable: listed, not read
      }
    }
  }

  const snapshot: ProjectSnapshot = { name: path.basename(root), files, allPaths, truncated };
  const graph = dependencyGraphCache.get(root);
  if (graph && Object.keys(graph.edges).length > 0) snapshot.dependencyEdges = graph.edges;
  const index = repositorySemanticIndexService.getIndex(root);
  if (index && !index.stale && index.features.length > 0) {
    snapshot.features = index.features.map((name) => ({ name, files: Object.values(index.files).filter((f) => f.featureRefs.includes(name)).map((f) => f.path) }));
  }
  return { snapshot, existing };
}

/** The files this task (executionId) really changed in this project, from the change ledger. */
export function ledgerChanges(executionId: string | undefined, rootPath: string): FileChange[] {
  if (!executionId) return [];
  let ledger;
  try {
    ledger = codeChangeStore().get(executionId);
  } catch {
    return [];
  }
  if (!ledger) return [];
  const root = safeRealpath(rootPath);
  const ledgerRoot = safeRealpath(ledger.projectRoot);
  const changes: FileChange[] = [];
  for (const entry of ledger.entries) {
    if (entry.status === 'unchanged' || entry.revertedAt) continue;
    const abs = path.resolve(ledgerRoot, entry.path);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (entry.status === 'renamed') {
      const before = path.relative(root, path.resolve(ledgerRoot, entry.originalPath)).replace(/\\/g, '/');
      if (!before.startsWith('..')) changes.push({ path: before, kind: 'deleted' });
      changes.push({ path: rel, kind: 'added' });
    } else changes.push({ path: rel, kind: entry.status === 'created' ? 'added' : entry.status === 'deleted' ? 'deleted' : 'modified' });
  }
  return changes;
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync.native(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runProjectDocs(request: DocsRequest): Promise<{ result: DocGenerationResult; changes: FileChange[] }> {
  const { snapshot, existing } = await collectProjectSnapshot(request.rootPath);
  const changes = request.sync ? ledgerChanges(request.executionId, request.rootPath) : [];
  const input: GenerateDocsInput = {
    snapshot,
    existing,
    date: today(),
    mode: request.sync ? 'sync' : 'full',
    changes,
    selection: { docs: request.docs, text: request.request },
    plan: request.plan && request.plan.markdown.trim() ? request.plan : undefined,
    adr: request.adr,
    changelog: request.changelog,
    policy: {
      allowCreate: true,
      adoptUnmanaged: Boolean(request.adoptExisting),
      // Documentation lives in Markdown/Mermaid files inside the project; never a secret path.
      allowPath: (p) => /\.(md|mmd)$/i.test(p) && !p.split('/').includes('..') && !isSecretPath(p),
    },
  };
  return { result: generateDocs(input), changes };
}

/** Resolve a documentation path inside the root; null when it would land outside it. */
export function resolveDocPath(rootPath: string, rel: string): string | null {
  const root = path.resolve(rootPath);
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
  return abs;
}
