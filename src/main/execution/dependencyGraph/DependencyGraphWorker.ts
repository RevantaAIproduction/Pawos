import * as fs from 'fs';
import * as path from 'path';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from '../languageProviders/TypeScriptLanguageProvider';
import { loadTsPaths, resolveSpecifier } from './importResolution';

// A forked child process is its own Node runtime — module-level state (including registrations)
// never crosses the fork boundary, so the worker registers its own providers rather than assuming
// anything the main process registered is visible here.
languageProviderRegistry.registerProvider(typeScriptLanguageProvider);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const MAX_DEPTH = 10;
// More generous than ProjectMapBuilder's 300-node tree cap (which is only ever an overview for a
// human/model to skim) — a dependency graph needs real file coverage to be useful, but this still
// bounds worst-case cost on a very large monorepo.
const MAX_FILES = 5000;

type PreviousGraph = {
  fileHashes: Record<string, number>;
  edges: Record<string, string[]>;
  exports: Record<string, string[]>;
};
type BuildMessage = { type: 'build'; root: string; previous?: PreviousGraph };
type ResultMessage = {
  type: 'result';
  edges: Record<string, string[]>;
  exports: Record<string, string[]>;
  fileHashes: Record<string, number>;
  filesAnalyzed: number;
  filesSkipped: number;
  filesReused: number;
};
type ErrorMessage = { type: 'error'; message: string };

function walkFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (languageProviderRegistry.getProviderForFile(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  walk(root, 0);
  return files;
}

function build(root: string, previous: PreviousGraph | undefined): ResultMessage {
  const tsPaths = loadTsPaths(root);
  const files = walkFiles(root);
  const edges: Record<string, string[]> = {};
  const exportsMap: Record<string, string[]> = {};
  const fileHashes: Record<string, number> = {};
  let filesSkipped = 0;
  let filesReused = 0;

  for (const filePath of files) {
    const provider = languageProviderRegistry.getProviderForFile(filePath);
    if (!provider) {
      filesSkipped += 1;
      continue;
    }
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      filesSkipped += 1;
      continue;
    }

    const relPath = path.relative(root, filePath);
    fileHashes[relPath] = mtimeMs;

    // Incremental reuse — a file whose mtime hasn't moved since the last build gets its previous
    // edges/exports spliced in unchanged rather than being re-read and re-parsed. A deleted file
    // simply never appears in `files` this pass, so it's naturally dropped rather than carried
    // forward stale.
    if (previous && previous.fileHashes[relPath] === mtimeMs) {
      edges[relPath] = previous.edges[relPath] ?? [];
      if (previous.exports[relPath]) exportsMap[relPath] = previous.exports[relPath];
      filesReused += 1;
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      filesSkipped += 1;
      continue;
    }

    const specifiers = provider.extractImports(content, filePath);
    const resolvedEdges = new Set<string>();
    for (const specifier of specifiers) {
      const resolved = resolveSpecifier(filePath, specifier, root, tsPaths);
      if (resolved) resolvedEdges.add(path.relative(root, resolved));
    }
    edges[relPath] = [...resolvedEdges];

    if (provider.extractExports) {
      exportsMap[relPath] = provider.extractExports(content, filePath);
    }
  }

  return {
    type: 'result',
    edges,
    exports: exportsMap,
    fileHashes,
    filesAnalyzed: files.length - filesSkipped - filesReused,
    filesSkipped,
    filesReused,
  };
}

// `process.send()` writes to the IPC pipe asynchronously — calling `process.exit()` immediately
// after it (the previous, buggy shape here) races the write and can truncate or silently drop the
// message for anything but the smallest payloads, exactly the failure mode a multi-MB dependency
// graph is likely to hit. Only exit inside `send`'s own callback, once the write has actually been
// flushed; if there's no IPC channel at all (`process.send` undefined — shouldn't happen under
// `fork()`, but defensive), exit immediately since there's nothing to flush.
function sendAndExit(message: ResultMessage | ErrorMessage): void {
  if (!process.send) {
    process.exit(0);
    return;
  }
  process.send(message, () => process.exit(0));
}

process.on('message', (message: BuildMessage) => {
  if (message?.type !== 'build') return;
  try {
    const result = build(message.root, message.previous);
    sendAndExit(result);
  } catch (err) {
    const errorMessage: ErrorMessage = { type: 'error', message: err instanceof Error ? err.message : 'Dependency graph build failed.' };
    sendAndExit(errorMessage);
  }
});
