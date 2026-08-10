import * as fs from 'fs';
import * as path from 'path';
import { languageProviderRegistry } from './languageProviders/LanguageProviderRegistry';
import type { RouteCandidate } from './languageProviders/LanguageProvider';
import type { DependencyGraphRecord } from './dependencyGraph/DependencyGraphCache';
import { TEST_FILE_PATTERN } from './ProjectAnalyzer';

// Generous for source files, guards against a pathologically large file blowing up a regex scan —
// matches the size-cap discipline contentScan.ts already uses for content search.
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
// A supplementary bounded walk for schema-convention files (.prisma, migrations/*.sql) that never
// appear in the dependency graph's file set, since no LanguageProvider matches those extensions —
// same SKIP_DIRS/depth-cap convention as ProjectMapBuilder/DependencyGraphWorker (kept as its own
// copy per the Phase 1 Technical Debt Register's "duplicate walk-bound constants" entry, slated for
// consolidation in Phase 5 rather than fixed ad hoc here).
const SCHEMA_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const SCHEMA_WALK_MAX_DEPTH = 10;
const SCHEMA_WALK_MAX_FILES = 2000;
// Caps a single feature's combined file-list size, mirroring ProjectMapBuilder's 300-node tree cap
// — a large monorepo cluster gets truncated rather than growing unbounded.
const MAX_FILES_PER_FEATURE = 300;

const FETCH_CALL = /\bfetch\s*\(\s*['"`](\/[^'"`]+)['"`]/g;
const AXIOS_CALL = /\baxios\.(?:get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"`]+)['"`]/g;
const MONGOOSE_SCHEMA_PATTERN = /\bnew\s+Schema\s*\(|\bmongoose\.model\s*\(/;

export type CodingFeature = {
  name: string;
  routeFiles: string[];
  componentFiles: string[];
  dataModelFiles: string[];
  configFiles: string[];
  testFiles: string[];
  confidence: number;
  method: string;
};

export type FeatureMap = { features: CodingFeature[] };

/** Deterministic connected-components clustering — no invented ML, just union-find over co-reference edges gathered by the steps below. */
class UnionFind {
  private parent = new Map<string, string>();

  private ensure(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    return x;
  }

  find(x: string): string {
    this.ensure(x);
    const p = this.parent.get(x) as string;
    if (p === x) return x;
    const rootId = this.find(p);
    this.parent.set(x, rootId);
    return rootId;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

/** Bounded, size-capped, binary-tolerant text read — a file that fails to read yields no content rather than throwing, matching every other reader in this codebase's "one bad file never breaks the whole analysis" discipline. */
function readTextFile(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_CONTENT_BYTES) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function walkForSchemaFiles(root: string): string[] {
  const found: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > SCHEMA_WALK_MAX_DEPTH || found.length >= SCHEMA_WALK_MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= SCHEMA_WALK_MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SCHEMA_SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.name.endsWith('.prisma') || (entry.name.endsWith('.sql') && /migrations?/i.test(dir))) {
        found.push(normalizeRel(path.relative(root, full)));
      }
    }
  }
  walk(root, 0);
  return found;
}

function extractApiCallPaths(content: string): string[] {
  const paths: string[] = [];
  for (const pattern of [FETCH_CALL, AXIOS_CALL]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content))) {
      if (m[1]) paths.push(m[1]);
    }
  }
  return paths;
}

/** Converts a Next.js-style route path (with `[id]`/`[...slug]` dynamic segments) into a matcher for literal API-call paths like `/api/users/123`. */
function routePathToRegex(httpPath: string): RegExp {
  const escaped = httpPath
    .split('/')
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.*';
      if (/^\[.+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${escaped}/?$`);
}

const MAX_IMPORT_HOPS = 5;

/** Bounded BFS over the dependency graph's forward edges — same maxDepth=5 precedent as MemoryGraphStore.getProvenanceChain(). */
function computeReachable(seed: string, edges: Record<string, string[]>): Set<string> {
  const reached = new Set<string>();
  let frontier = [seed];
  for (let hop = 0; hop < MAX_IMPORT_HOPS && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const imported of (edges[f] ?? []).map(normalizeRel)) {
        if (!reached.has(imported) && imported !== seed) {
          reached.add(imported);
          next.push(imported);
        }
      }
    }
    frontier = next;
  }
  return reached;
}

function discoverRoutes(root: string, files: string[], contents: Map<string, string>, framework: string | null): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  for (const relPath of files) {
    const provider = languageProviderRegistry.getProviderForFile(relPath);
    if (!provider?.detectRouteCandidates) continue;
    const content = contents.get(relPath) ?? '';
    candidates.push(...provider.detectRouteCandidates(content, relPath, framework));
  }
  void root;
  return candidates;
}

/**
 * Reads every code file's content and runs route discovery — the exact same preamble
 * `buildFeatureMap()` itself uses for its own Step 1, exported (additive-only, no change to
 * `buildFeatureMap`'s own behavior) so Domain Intelligence (Phase 4, §9) can reuse real
 * route/method data (`RouteCandidate.method`, needed for crudResource detection) without
 * re-deriving it or duplicating a second file-reading loop.
 */
export function discoverProjectRoutes(root: string, dependencyGraph: DependencyGraphRecord | undefined, framework: string | null): RouteCandidate[] {
  const codeFiles = dependencyGraph ? Object.keys(dependencyGraph.fileHashes).map(normalizeRel) : [];
  const contents = new Map<string, string>();
  for (const relPath of codeFiles) {
    const content = readTextFile(path.join(root, relPath));
    if (content !== null) contents.set(relPath, content);
  }
  return discoverRoutes(root, codeFiles, contents, framework);
}

function classifyFile(relPath: string, routeFileSet: Set<string>, dataModelFileSet: Set<string>): 'route' | 'dataModel' | 'test' | 'config' | 'component' {
  if (routeFileSet.has(relPath)) return 'route';
  if (dataModelFileSet.has(relPath)) return 'dataModel';
  if (TEST_FILE_PATTERN.test(relPath)) return 'test';
  if (/config/i.test(path.basename(relPath))) return 'config';
  return 'component';
}

function capList(files: string[]): string[] {
  return [...new Set(files)].sort().slice(0, MAX_FILES_PER_FEATURE);
}

/**
 * Deterministic, evidence-based feature clustering (Coding Runtime V2, §6). Every cluster is
 * *seeded* by a route file — a cluster with no traced route is never created, matching the plan's
 * "seeded one cluster per top-level route" design and this component's own goal (a feature
 * implements one *user-facing* capability, which requires a route as its anchor). Reads file
 * content directly (bounded, size-capped) rather than through a forked worker — unlike §5's
 * TypeScript-compiler work, this is plain regex/string scanning, not compiler-cost work; flagged as
 * a real, bounded (MAX_FILES already enforced upstream by the dependency graph) main-process cost
 * worth revisiting if it proves too heavy on a very large real project.
 */
export function buildFeatureMap(root: string, dependencyGraph: DependencyGraphRecord | undefined, framework: string | null): FeatureMap {
  const codeFiles = dependencyGraph ? Object.keys(dependencyGraph.fileHashes).map(normalizeRel) : [];
  const contents = new Map<string, string>();
  for (const relPath of codeFiles) {
    const content = readTextFile(path.join(root, relPath));
    if (content !== null) contents.set(relPath, content);
  }

  // Step 1 — route/page discovery.
  const routeCandidates = discoverRoutes(root, codeFiles, contents, framework);
  const routeFileSet = new Set(routeCandidates.map((rc) => normalizeRel(rc.filePath)));
  if (routeFileSet.size === 0) return { features: [] };

  const uf = new UnionFind();
  const clustered = new Set<string>(routeFileSet);
  for (const f of routeFileSet) uf.find(f);

  // Step 1.5 — direct-import component discovery. A page importing its own components is the most
  // basic real signal two files belong to the same feature — more fundamental than the API-call
  // correlation in step 2. Bounded BFS (same maxDepth=5 precedent as
  // MemoryGraphStore.getProvenanceChain) from each route file over the dependency graph's edges,
  // but a file is only ever claimed by a route if that route is the *only* one that reaches it —
  // a shared `Layout.tsx` imported by every page must never merge all those pages into one
  // feature, so a file reachable from more than one route is treated as a shared utility and left
  // unclustered here (it may still join a cluster later via a more specific signal).
  const importClaimedFiles = new Set<string>();
  const apiClaimedFiles = new Set<string>();

  if (dependencyGraph) {
    const reachableByRoute = new Map<string, Set<string>>();
    for (const routeFile of routeFileSet) reachableByRoute.set(routeFile, computeReachable(routeFile, dependencyGraph.edges));

    const reachCount = new Map<string, number>();
    for (const reached of reachableByRoute.values()) {
      for (const f of reached) reachCount.set(f, (reachCount.get(f) ?? 0) + 1);
    }

    for (const [routeFile, reached] of reachableByRoute) {
      for (const f of reached) {
        if (reachCount.get(f) === 1) {
          clustered.add(f);
          importClaimedFiles.add(f);
          uf.union(routeFile, f);
        }
      }
    }
  }

  // Step 2 — component-to-API-call tracing (catches files not statically imported by the page,
  // e.g. a route.ts API endpoint hit only over HTTP, never imported by anything).
  for (const [relPath, content] of contents) {
    if (routeFileSet.has(relPath)) continue;
    const apiPaths = extractApiCallPaths(content);
    if (apiPaths.length === 0) continue;
    const matchingRouteFiles = new Set<string>();
    for (const rc of routeCandidates) {
      if (!rc.httpPath) continue;
      const regex = routePathToRegex(rc.httpPath);
      if (apiPaths.some((p) => regex.test(p))) matchingRouteFiles.add(normalizeRel(rc.filePath));
    }
    if (matchingRouteFiles.size === 0) continue;
    // Same "exclusively claimed" discipline as steps 1.5/3: a fetch call that ambiguously matches
    // more than one distinct route (e.g. a literal '/api/dashboard' route alongside a dynamic
    // '/api/[id]' catch-all also matching that literal path) must never be used to merge those two
    // routes' features together — only act when every match resolves to the same cluster.
    const matchingGroups = new Set([...matchingRouteFiles].map((f) => uf.find(f)));
    if (matchingGroups.size === 1) {
      const [routeFile] = matchingRouteFiles;
      clustered.add(relPath);
      apiClaimedFiles.add(relPath);
      uf.union(relPath, routeFile as string);
    }
  }

  // Step 3 — data model discovery. Mongoose schemas live in already-scanned code files; Prisma
  // schema files and SQL migrations are convention-based, not language-syntax-based, so they come
  // from a separate bounded walk rather than the Language Provider seam (per §6's own design).
  const mongooseFiles = codeFiles.filter((f) => {
    const c = contents.get(f);
    return c ? MONGOOSE_SCHEMA_PATTERN.test(c) : false;
  });
  const schemaConventionFiles = walkForSchemaFiles(root);
  const dataModelFileSet = new Set([...mongooseFiles, ...schemaConventionFiles]);

  // KNOWN LIMITATION (honest, not silently glossed over): the association check below only finds a
  // model file if some *already-clustered* file's dependency-graph edge points at it. Mongoose
  // model files (plain .ts/.js) genuinely get imported via ES `import`, so this works for them —
  // but `.prisma` schema files and SQL migration files are never the target of a real ES import
  // (real Prisma usage imports `@prisma/client`, never the `.prisma` file itself), so
  // `schemaConventionFiles` currently can never satisfy this check and will never be associated
  // with any feature, even though `walkForSchemaFiles()` correctly finds them. They remain
  // detected-but-unlinked rather than fabricating a false association — a real, deliberately
  // unfixed gap for this phase, flagged in the Technical Debt Register.
  if (dependencyGraph) {
    for (const modelFile of dataModelFileSet) {
      // Same "exclusively claimed" discipline as step 1.5: a model imported by files spanning more
      // than one already-formed cluster is a shared model, not this feature's alone — never used to
      // silently merge two unrelated features together.
      const claimingGroups = new Set<string>();
      for (const [file, imports] of Object.entries(dependencyGraph.edges)) {
        if (imports.map(normalizeRel).includes(modelFile) && clustered.has(file)) claimingGroups.add(uf.find(file));
      }
      if (claimingGroups.size === 1) {
        const [onlyGroup] = claimingGroups;
        clustered.add(modelFile);
        uf.union(onlyGroup as string, modelFile);
      }
    }
  }

  // Step 4 — test/config association: a file joins an *existing* cluster (never seeds a new one)
  // if it shares a directory/name stem with, or is exclusively imported by, a file already in that
  // cluster.
  const snapshotBeforeAssociation = new Set(clustered);
  for (const relPath of codeFiles) {
    if (clustered.has(relPath)) continue;
    const isTest = TEST_FILE_PATTERN.test(relPath);
    const isConfigLike = /config/i.test(path.basename(relPath));
    if (!isTest && !isConfigLike) continue;

    if (isTest) {
      const dir = path.dirname(relPath);
      const stem = path.basename(relPath).replace(/\.(test|spec)\.[jt]sx?$/, '');
      const siblings = [...snapshotBeforeAssociation].filter((f) => path.dirname(f) === dir && path.basename(f).startsWith(stem));
      if (siblings.length > 0) {
        clustered.add(relPath);
        for (const sibling of siblings) uf.union(relPath, sibling);
        continue;
      }
    }

    if (dependencyGraph) {
      const claimingGroups = new Set<string>();
      for (const clusteredFile of snapshotBeforeAssociation) {
        const imports = (dependencyGraph.edges[clusteredFile] ?? []).map(normalizeRel);
        if (imports.includes(relPath)) claimingGroups.add(uf.find(clusteredFile));
      }
      if (claimingGroups.size === 1) {
        const [onlyGroup] = claimingGroups;
        clustered.add(relPath);
        uf.union(onlyGroup as string, relPath);
      }
    }
  }

  // Group by connected-component root, then classify each file into its output bucket.
  const groups = new Map<string, Set<string>>();
  for (const f of clustered) {
    const groupRoot = uf.find(f);
    if (!groups.has(groupRoot)) groups.set(groupRoot, new Set());
    groups.get(groupRoot)?.add(f);
  }

  const features: CodingFeature[] = [];
  for (const files of groups.values()) {
    const routeFiles: string[] = [];
    const componentFiles: string[] = [];
    const dataModelFiles: string[] = [];
    const configFiles: string[] = [];
    const testFiles: string[] = [];

    for (const f of files) {
      switch (classifyFile(f, routeFileSet, dataModelFileSet)) {
        case 'route':
          routeFiles.push(f);
          break;
        case 'dataModel':
          dataModelFiles.push(f);
          break;
        case 'test':
          testFiles.push(f);
          break;
        case 'config':
          configFiles.push(f);
          break;
        default:
          componentFiles.push(f);
      }
    }

    if (routeFiles.length === 0) continue; // every real feature is route-seeded; defensive, should be unreachable

    const routeCandidatesInGroup = routeCandidates.filter((rc) => routeFiles.includes(normalizeRel(rc.filePath)));
    const httpPaths = routeCandidatesInGroup.map((rc) => rc.httpPath).filter((p): p is string => Boolean(p));
    const name = httpPaths.length > 0 ? [...httpPaths].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] : path.dirname(routeFiles[0] ?? '');

    let confidence = 0.4;
    const methodParts = ['route-convention'];
    const hasImportLinkedComponent = componentFiles.some((f) => importClaimedFiles.has(f));
    const hasApiLinkedComponent = componentFiles.some((f) => apiClaimedFiles.has(f));
    if (hasImportLinkedComponent) {
      confidence += 0.2;
      methodParts.push('import-graph');
    }
    if (hasApiLinkedComponent) {
      confidence += 0.2;
      methodParts.push('api-call-correlation');
    }
    if (dataModelFiles.length > 0) {
      confidence += 0.1;
      methodParts.push('data-model-association');
    }
    if (testFiles.length > 0 || configFiles.length > 0) {
      confidence += 0.1;
      methodParts.push('name-stem-association');
    }

    features.push({
      name: name || 'unnamed-feature',
      routeFiles: capList(routeFiles),
      componentFiles: capList(componentFiles),
      dataModelFiles: capList(dataModelFiles),
      configFiles: capList(configFiles),
      testFiles: capList(testFiles),
      confidence: Math.min(1, confidence),
      method: methodParts.join(' + '),
    });
  }

  return { features: features.sort((a, b) => a.name.localeCompare(b.name)) };
}
