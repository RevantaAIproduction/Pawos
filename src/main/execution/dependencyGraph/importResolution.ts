import * as fs from 'fs';
import * as path from 'path';

export type TsPathsConfig = { baseUrl: string; paths: Record<string, string[]> } | null;

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const RESOLVE_INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// Only the project's own top-level tsconfig.json — an `extends` chain is a real gap (flagged, not
// silently pretended-away): a monorepo whose paths mapping lives entirely in a shared base config
// won't resolve alias imports until a future pass follows `extends`.
export function loadTsPaths(root: string): TsPathsConfig {
  const tsconfig = readJson(path.join(root, 'tsconfig.json'));
  const compilerOptions = tsconfig?.compilerOptions;
  if (!compilerOptions?.paths) return null;
  return {
    baseUrl: path.resolve(root, compilerOptions.baseUrl ?? '.'),
    paths: compilerOptions.paths,
  };
}

export function resolveExisting(candidate: string): string | null {
  for (const suffix of RESOLVE_SUFFIXES) {
    const withSuffix = candidate + suffix;
    if (fs.existsSync(withSuffix) && fs.statSync(withSuffix).isFile()) return withSuffix;
  }
  for (const indexSuffix of RESOLVE_INDEX_SUFFIXES) {
    const withIndex = candidate + indexSuffix;
    if (fs.existsSync(withIndex)) return withIndex;
  }
  return null;
}

export function resolveAliasSpecifier(specifier: string, tsPaths: TsPathsConfig): string | null {
  if (!tsPaths) return null;
  for (const [pattern, targets] of Object.entries(tsPaths.paths)) {
    const prefix = pattern.replace(/\*$/, '');
    if (!specifier.startsWith(prefix)) continue;
    const rest = specifier.slice(prefix.length);
    const target = targets[0];
    if (!target) continue;
    return path.join(tsPaths.baseUrl, target.replace(/\*$/, '') + rest);
  }
  return null;
}

/**
 * Resolves one module specifier from `fromFile` to a real file on disk, or `null` if it can't be
 * (an external npm package, a genuinely broken import, or an alias this project's tsconfig doesn't
 * define). Shared by `DependencyGraphWorker.ts` (building the project-wide import graph) and the
 * Validation Pipeline's imports check (Coding Runtime V2 §12, flagging broken relative imports after
 * an edit) — extracted here so both consumers resolve specifiers identically rather than maintaining
 * two copies of the same resolution rules.
 */
export function resolveSpecifier(fromFile: string, specifier: string, root: string, tsPaths: TsPathsConfig): string | null {
  let candidate: string | null = null;
  if (specifier.startsWith('.')) {
    candidate = path.resolve(path.dirname(fromFile), specifier);
  } else if (!specifier.startsWith('/')) {
    candidate = resolveAliasSpecifier(specifier, tsPaths);
  }
  if (!candidate) return null;
  const resolved = resolveExisting(candidate);
  if (!resolved) return null;
  // Never resolve outside the project root — an alias or a deeply relative import that happens to
  // land in node_modules or above root is treated the same as an unresolved external import.
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}
