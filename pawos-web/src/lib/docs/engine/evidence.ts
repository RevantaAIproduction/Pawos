/**
 * Repository evidence: what the documentation is allowed to say. Every extractor here reads real
 * file contents from the snapshot and records where each fact came from. Nothing is inferred from
 * a file name alone when the contents can be read, and nothing is invented when they cannot — the
 * gap is recorded as `uncertain` and the documents say so.
 */

import type { ProjectSnapshot, SourceFile } from './types';
import { isExampleEnvPath, isSecretPath } from './secrets';
import { balancedFrom, basename, collapseWhitespace, dirname, joinRelative, jsDocBefore, posix, splitTopLevel, stripComments } from './parse';

// ── package.json and stack ──────────────────────────────────────────────────────────────────────

export interface PackageInfo {
  path: string;
  name?: string;
  description?: string;
  version?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines: Record<string, string>;
}

export function parsePackageJson(file: SourceFile): PackageInfo | null {
  try {
    const raw = JSON.parse(file.content) as Record<string, unknown>;
    const record = (v: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (v && typeof v === 'object') for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === 'string') out[k] = val;
      return out;
    };
    return {
      path: file.path,
      name: typeof raw.name === 'string' ? raw.name : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      version: typeof raw.version === 'string' ? raw.version : undefined,
      scripts: record(raw.scripts),
      dependencies: record(raw.dependencies),
      devDependencies: record(raw.devDependencies),
      engines: record(raw.engines),
    };
  } catch {
    return null;
  }
}

const STACK_SIGNALS: [string, string][] = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['@angular/core', 'Angular'],
  ['solid-js', 'SolidJS'],
  ['electron', 'Electron'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['hono', 'Hono'],
  ['@nestjs/core', 'NestJS'],
  ['vite', 'Vite'],
  ['webpack', 'webpack'],
  ['tailwindcss', 'Tailwind CSS'],
  ['@supabase/supabase-js', 'Supabase'],
  ['@prisma/client', 'Prisma'],
  ['prisma', 'Prisma'],
  ['drizzle-orm', 'Drizzle ORM'],
  ['mongoose', 'Mongoose'],
  ['pg', 'PostgreSQL (pg)'],
  ['firebase', 'Firebase'],
  ['typescript', 'TypeScript'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['@playwright/test', 'Playwright'],
  ['cypress', 'Cypress'],
  ['three', 'three.js'],
  ['@reduxjs/toolkit', 'Redux Toolkit'],
  ['zustand', 'Zustand'],
  ['@tanstack/react-query', 'TanStack Query'],
  ['@mui/material', 'MUI'],
  ['@chakra-ui/react', 'Chakra UI'],
  ['styled-components', 'styled-components'],
];

export function detectStack(packages: PackageInfo[], paths: string[]): string[] {
  const found = new Set<string>();
  for (const pkg of packages) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of STACK_SIGNALS) if (deps[dep] !== undefined) found.add(label);
  }
  if (paths.some((p) => /(^|\/)tsconfig(\.[\w-]+)?\.json$/.test(p))) found.add('TypeScript');
  if (paths.some((p) => /(^|\/)(requirements\.txt|pyproject\.toml)$/.test(p))) found.add('Python');
  if (paths.some((p) => /(^|\/)go\.mod$/.test(p))) found.add('Go');
  if (paths.some((p) => /(^|\/)Cargo\.toml$/.test(p))) found.add('Rust');
  return [...found].sort();
}

// ── components and props ────────────────────────────────────────────────────────────────────────

export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  defaultValue?: string;
}

export interface ComponentInfo {
  name: string;
  path: string;
  kind: 'component' | 'widget' | 'page';
  exportKind: 'named' | 'default';
  description?: string;
  /** The props type's name as written ("ButtonProps"), or "inline". */
  propsType?: string;
  props: PropInfo[];
  /** False when the props type could not be read from this file (imported, computed, untyped). */
  propsResolved: boolean;
  /** Why the props are not fully known, when they are not. */
  uncertain?: string;
  hooks: string[];
  /** UI states the source visibly handles (from identifiers it uses). */
  states: string[];
  clientOnly: boolean;
  /** Files that import this component's file and render it. */
  usedBy: string[];
}

const COMPONENT_FILE = /\.(tsx|jsx)$/;
const NOT_COMPONENT_FILE = /(\.(test|spec|stories|story)\.(tsx|jsx)$)|(\.d\.ts$)|(^|\/)(__tests__|__mocks__|node_modules)\//;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;

export function isComponentFile(path: string): boolean {
  return COMPONENT_FILE.test(path) && !NOT_COMPONENT_FILE.test(path);
}

export function isWidgetPath(path: string): boolean {
  return /(^|\/)widgets?\//i.test(path);
}

export function isPagePath(path: string): boolean {
  return /(^|\/)app\/(.*\/)?page\.(tsx|jsx|ts|js)$/.test(path) || (/(^|\/)pages\/.+\.(tsx|jsx)$/.test(path) && !/(^|\/)pages\/(api\/|_app\.|_document\.|_error\.)/.test(path));
}

interface Declared {
  name: string;
  index: number;
  params: string | null;
  annotatedProps?: string;
  exportKind: 'named' | 'default' | 'none';
}

function declaredComponents(code: string): Declared[] {
  const out: Declared[] = [];
  const fnRe = /(export\s+(default\s+)?)?(async\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*(<[^>(]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(code))) {
    const open = m.index + m[0].length - 1;
    const params = balancedFrom(code, open);
    out.push({ name: m[4] ?? '', index: m.index, params: params ? params.inner : null, exportKind: m[1] ? (m[2] ? 'default' : 'named') : 'none' });
  }
  const constRe = /(export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*(:\s*([A-Za-z_.]+)\s*<)?/g;
  while ((m = constRe.exec(code))) {
    let cursor = m.index + m[0].length;
    let annotatedProps: string | undefined;
    if (m[3]) {
      const generic = balancedFrom(code, cursor - 1, true);
      if (generic && /(^|\.)(FC|FunctionComponent|VFC|ComponentType)$/.test(m[4] ?? '')) annotatedProps = generic.inner.trim();
      if (generic) cursor = generic.end + 1;
    }
    const eq = code.indexOf('=', cursor);
    if (eq < 0) continue;
    // Only `const X = (...) =>`, `const X = function (...)`, `memo(...)`/`forwardRef(...)` wrappers.
    const after = code.slice(eq + 1, eq + 400);
    const wrap = /^\s*(?:React\.)?(memo|forwardRef)\s*(<[^>(]*>)?\s*\(\s*/.exec(after);
    let start = eq + 1 + (wrap ? wrap[0].length : 0);
    const rest = code.slice(start, start + 300);
    const fn = /^\s*(async\s*)?(function\s*[A-Za-z0-9_]*\s*)?(<[^>(]*>\s*)?\(/.exec(rest);
    if (!fn) continue;
    start += fn[0].length - 1;
    const params = balancedFrom(code, start);
    if (!params) continue;
    if (!fn[2]) {
      const arrow = code.slice(params.end + 1, params.end + 200);
      if (!/^\s*(:\s*[^=]+)?=>/.test(arrow)) continue;
    }
    let paramText = params.inner;
    if (wrap && wrap[1] === 'forwardRef') paramText = splitTopLevel(paramText, [','])[0] ?? '';
    out.push({ name: m[2] ?? '', index: m.index, params: paramText, annotatedProps, exportKind: m[1] ? 'named' : 'none' });
  }
  return out;
}

function exportedNames(code: string): { named: Set<string>; defaultName: string | null } {
  const named = new Set<string>();
  let defaultName: string | null = null;
  const listRe = /export\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(code))) {
    for (const part of (m[1] ?? '').split(',')) {
      const [local, alias] = part.trim().split(/\s+as\s+/);
      if (!local) continue;
      if (alias === 'default') defaultName = local;
      else named.add(local);
    }
  }
  const def = /export\s+default\s+(?:React\.)?(?:memo\s*\(\s*)?([A-Z][A-Za-z0-9]*)\s*\)?\s*;?/.exec(code);
  if (def && def[1]) defaultName = def[1];
  return { named, defaultName };
}

/** Parse the members of a TypeScript object type body (`a: string; b?: number`). */
export function parseTypeMembers(body: string): PropInfo[] {
  const props: PropInfo[] = [];
  let pendingDoc: string | undefined;
  // Newlines separate members too, but a union or intersection may continue on the next line.
  const parts: string[] = [];
  for (const raw of splitTopLevel(body, [';', ',', '\n'], true)) {
    const text = stripComments(raw).trim();
    const prev = parts.length > 0 ? stripComments(parts[parts.length - 1] ?? '').trim() : '';
    if (text && prev && (/^[|&]/.test(text) || /(:|\||&|=>)$/.test(prev))) parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''} ${raw}`;
    else parts.push(raw);
  }
  for (const raw of parts) {
    const docMatch = /\/\*\*([\s\S]*?)\*\//.exec(raw);
    const text = collapseWhitespace(stripComments(raw));
    if (!text) {
      if (docMatch) pendingDoc = jsDocBefore(docMatch[0], docMatch[0].length);
      else {
        const line = /\/\/\s*(.+)$/.exec(raw.trim());
        if (line && line[1]) pendingDoc = line[1].trim();
      }
      continue;
    }
    if (docMatch && raw.indexOf(docMatch[0]) < raw.indexOf(text.split(/\s/)[0] ?? text)) pendingDoc = jsDocBefore(docMatch[0], docMatch[0].length);
    const member = /^(readonly\s+)?(\[[^\]]+\]|['"]?[A-Za-z_$][\w$-]*['"]?)(\?)?\s*(\([\s\S]*\))?\s*:\s*([\s\S]+)$/.exec(text);
    if (!member) {
      pendingDoc = undefined;
      continue;
    }
    const name = (member[2] ?? '').replace(/^['"]|['"]$/g, '');
    const type = member[4] ? `${member[4]} => ${member[5] ?? ''}` : (member[5] ?? '');
    const trailing = /\/\/\s*(.+)$/.exec(raw);
    props.push({ name, type: collapseWhitespace(type), optional: Boolean(member[3]), description: pendingDoc ?? (trailing?.[1]?.trim() || undefined) });
    pendingDoc = undefined;
  }
  return props;
}

interface ResolvedType {
  props: PropInfo[];
  resolved: boolean;
  note?: string;
}

function resolvePropsType(code: string, typeText: string, depth = 0): ResolvedType {
  const t = typeText.trim();
  if (!t) return { props: [], resolved: true };
  if (t.startsWith('{')) {
    const inner = balancedFrom(t, 0, true);
    return inner ? { props: parseTypeMembers(inner.inner), resolved: true } : { props: [], resolved: false, note: 'The inline props type could not be read.' };
  }
  if (depth > 3) return { props: [], resolved: false, note: `${t} is nested too deeply to read.` };
  const parts = splitTopLevel(t, ['&'], true).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const merged: PropInfo[] = [];
    const notes: string[] = [];
    let resolved = true;
    for (const part of parts) {
      const r = resolvePropsType(code, part, depth + 1);
      merged.push(...r.props);
      if (!r.resolved) resolved = false;
      if (r.note) notes.push(r.note);
    }
    return { props: merged, resolved, note: notes.join(' ') || undefined };
  }
  const ident = /^([A-Za-z_$][\w$]*)(<[\s\S]*>)?$/.exec(t);
  if (!ident) return { props: [], resolved: false, note: `Props of type \`${t}\` are not declared in this file.` };
  const name = (ident[1] ?? '').replace(/\$/g, '\\$');
  const iface = new RegExp(`(?:export\\s+)?interface\\s+${name}\\b\\s*(<[^{]*>)?\\s*(extends\\s+([^{]+))?\\{`).exec(code);
  if (iface) {
    const body = balancedFrom(code, iface.index + iface[0].length - 1, true);
    if (!body) return { props: [], resolved: false, note: `Interface ${name} could not be read.` };
    const own = parseTypeMembers(body.inner);
    if (iface[3]) {
      const bases = splitTopLevel(iface[3], [','], true).map((b) => b.trim()).filter(Boolean);
      const merged = [...own];
      const notes: string[] = [];
      let resolved = true;
      for (const base of bases) {
        const r = resolvePropsType(code, base, depth + 1);
        merged.push(...r.props.filter((p) => !own.some((o) => o.name === p.name)));
        if (!r.resolved) resolved = false;
        if (r.note) notes.push(r.note);
      }
      return { props: merged, resolved, note: notes.join(' ') || undefined };
    }
    return { props: own, resolved: true };
  }
  const alias = new RegExp(`(?:export\\s+)?type\\s+${name}\\b\\s*(<[^=]*>)?\\s*=\\s*`).exec(code);
  if (alias) {
    const start = alias.index + alias[0].length;
    const rest = code.slice(start);
    let end = 0;
    let depthCount = 0;
    for (; end < rest.length; end++) {
      const ch = rest[end];
      if (ch === '{' || ch === '(' || ch === '[' || ch === '<') depthCount++;
      else if (ch === '}' || ch === ')' || ch === ']' || (ch === '>' && rest[end - 1] !== '=')) depthCount--;
      else if (depthCount === 0 && (ch === ';' || (ch === '\n' && !/[&|{(<,]\s*$/.test(rest.slice(0, end)) && !/^\s*[&|]/.test(rest.slice(end + 1))))) break;
    }
    return resolvePropsType(code, rest.slice(0, end), depth + 1);
  }
  return { props: [], resolved: false, note: `Props type \`${ident[1] ?? name}\` is imported or declared elsewhere; its members were not read.` };
}

function destructuredDefaults(pattern: string): { names: string[]; defaults: Record<string, string>; rest: boolean } {
  const inner = pattern.trim().replace(/^\{/, '').replace(/\}$/, '');
  const names: string[] = [];
  const defaults: Record<string, string> = {};
  let rest = false;
  for (const raw of splitTopLevel(inner, [','])) {
    const part = collapseWhitespace(stripComments(raw));
    if (!part) continue;
    if (part.startsWith('...')) {
      rest = true;
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?(?:=\s*([\s\S]+))?$/.exec(part);
    if (!m || !m[1]) continue;
    names.push(m[1]);
    if (m[2]) defaults[m[1]] = m[2].trim();
  }
  return { names, defaults, rest };
}

const STATE_SIGNALS: [string, RegExp][] = [
  ['loading', /\b(is)?loading\b|\bisPending\b|\bpending\b|<Spinner|<Skeleton/i],
  ['error', /\b(error|isError|hasError)\b/],
  ['empty', /\.length\s*===\s*0|\bisEmpty\b|\bno (items|results|data)\b/i],
  ['disabled', /\bdisabled\b/],
  ['open/closed', /\b(isOpen|open|setOpen|expanded|collapsed)\b/],
  ['selected', /\b(selected|isSelected|active|isActive)\b/],
];

export function extractComponents(file: SourceFile): ComponentInfo[] {
  if (!isComponentFile(file.path)) return [];
  const code = file.content;
  if (!/<[A-Za-z][\w.]*[\s/>]|<>/.test(code)) return [];
  const { named, defaultName } = exportedNames(code);
  const declared = declaredComponents(code);
  const seen = new Set<string>();
  const out: ComponentInfo[] = [];
  const isTs = file.path.endsWith('.tsx');
  const hooks = [...new Set((code.match(/\buse[A-Z][A-Za-z0-9]*(?=\s*[(<])/g) ?? []).filter((h) => h !== 'useCallback' && h !== 'useMemo'))].sort();
  const states = STATE_SIGNALS.filter(([, re]) => re.test(code)).map(([label]) => label);
  const clientOnly = /^\s*['"]use client['"]/.test(code);
  const page = isPagePath(file.path);

  for (const decl of declared) {
    if (seen.has(decl.name) || !PASCAL.test(decl.name)) continue;
    const exportKind = decl.exportKind === 'none' ? (defaultName === decl.name ? 'default' : named.has(decl.name) ? 'named' : null) : decl.exportKind;
    if (!exportKind) continue;
    seen.add(decl.name);

    let propsType: string | undefined;
    let props: PropInfo[] = [];
    let resolved = true;
    let uncertain: string | undefined;
    const params = decl.params === null ? null : stripComments(decl.params).trim();
    // Comments inside the props type are kept: they are the props' descriptions.
    const firstParam = params ? (splitTopLevel(decl.params ?? '', [','])[0] ?? '').replace(/^(\s*\/\*[\s\S]*?\*\/|\s*\/\/[^\n]*\n)*/, '').trim() : '';

    if (params === null) {
      resolved = false;
      uncertain = 'The component signature could not be read.';
    } else if (firstParam || decl.annotatedProps) {
      let pattern = firstParam;
      let typeText = decl.annotatedProps ?? '';
      if (firstParam.startsWith('{')) {
        const close = balancedFrom(firstParam, 0);
        pattern = close ? firstParam.slice(0, close.end + 1) : firstParam;
        const tail = close ? firstParam.slice(close.end + 1).trim() : '';
        if (tail.startsWith(':')) typeText = tail.slice(1).replace(/=\s*\{\s*\}\s*$/, '').trim();
      } else {
        const colon = firstParam.indexOf(':');
        if (colon >= 0) typeText = firstParam.slice(colon + 1).trim();
        pattern = colon >= 0 ? firstParam.slice(0, colon) : firstParam;
      }
      const destructured = pattern.trim().startsWith('{') ? destructuredDefaults(pattern) : null;
      if (typeText) {
        propsType = typeText.trim().startsWith('{') ? 'inline' : collapseWhitespace(typeText);
        const r = resolvePropsType(code, typeText);
        props = r.props;
        resolved = r.resolved;
        uncertain = r.note;
      } else if (destructured) {
        props = destructured.names.map((name) => ({ name, type: isTs ? 'not typed' : 'not typed (JavaScript)', optional: name in destructured.defaults }));
        resolved = false;
        uncertain = isTs ? 'The props have no type annotation; types are not known.' : 'JavaScript component: prop names come from destructuring, types are not declared.';
      } else {
        resolved = false;
        uncertain = 'The props are taken as one untyped object; individual props are not known.';
      }
      if (destructured) {
        for (const p of props) if (destructured.defaults[p.name] !== undefined) p.defaultValue = destructured.defaults[p.name];
        if (destructured.rest && resolved) uncertain = `${uncertain ? `${uncertain} ` : ''}Remaining props are passed through (\`...rest\`).`;
      }
    }

    out.push({
      name: decl.name,
      path: file.path,
      kind: page ? 'page' : isWidgetPath(file.path) ? 'widget' : 'component',
      exportKind,
      description: jsDocBefore(code, decl.index),
      propsType,
      props,
      propsResolved: resolved,
      uncertain,
      hooks,
      states,
      clientOnly,
      usedBy: [],
    });
  }
  return out;
}

// ── imports and the module graph ────────────────────────────────────────────────────────────────

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte)$/;
const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

export function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}

export function resolveImport(fromPath: string, spec: string, known: Set<string>): string | null {
  let base: string | null = null;
  if (spec.startsWith('.')) base = joinRelative(dirname(fromPath), spec);
  else if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('~/')) base = `src/${spec.slice(2)}`;
  if (base === null) return null;
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (known.has(candidate)) return candidate;
  }
  return null;
}

export function importEdges(snapshot: ProjectSnapshot, known: Set<string>): Record<string, string[]> {
  if (snapshot.dependencyEdges && Object.keys(snapshot.dependencyEdges).length > 0) {
    const out: Record<string, string[]> = {};
    for (const [from, tos] of Object.entries(snapshot.dependencyEdges)) out[posix(from)] = tos.map(posix);
    return out;
  }
  const edges: Record<string, string[]> = {};
  for (const file of snapshot.files) {
    if (!CODE_FILE.test(file.path)) continue;
    const targets = new Set<string>();
    for (const spec of importSpecifiers(file.content)) {
      const resolved = resolveImport(file.path, spec, known);
      if (resolved && resolved !== file.path) targets.add(resolved);
    }
    if (targets.size > 0) edges[file.path] = [...targets].sort();
  }
  return edges;
}

/** Which area of the project a file belongs to: `src/main`, `app`, `lib`, or `(root)`. */
export function moduleOf(path: string): string {
  const parts = path.split('/');
  if (parts.length === 1) return '(root)';
  const first = parts[0] ?? '';
  if (['src', 'packages', 'apps', 'lib', 'app'].includes(first) && parts.length >= 3) return `${first}/${parts[1]}`;
  return first;
}

export interface ModuleGraph {
  modules: { name: string; files: number }[];
  edges: { from: string; to: string; imports: number }[];
  /** Edges came from a real import graph (true) or from scanning import statements here (false). */
  fromRuntimeGraph: boolean;
}

export function moduleGraph(edges: Record<string, string[]>, paths: string[], fromRuntimeGraph: boolean, limit = 18): ModuleGraph {
  const counts = new Map<string, number>();
  for (const p of paths) if (CODE_FILE.test(p) && !/\.(test|spec)\./.test(p)) counts.set(moduleOf(p), (counts.get(moduleOf(p)) ?? 0) + 1);
  const pairCounts = new Map<string, number>();
  for (const [from, tos] of Object.entries(edges)) {
    const a = moduleOf(from);
    for (const to of tos) {
      const b = moduleOf(to);
      if (a === b) continue;
      const key = `${a}\u0000${b}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }
  const degree = new Map<string, number>();
  for (const [key, n] of pairCounts) {
    const [a = '', b = ''] = key.split('\u0000');
    degree.set(a, (degree.get(a) ?? 0) + n);
    degree.set(b, (degree.get(b) ?? 0) + n);
  }
  const ranked = [...counts.keys()].sort((x, y) => (degree.get(y) ?? 0) - (degree.get(x) ?? 0) || (counts.get(y) ?? 0) - (counts.get(x) ?? 0) || x.localeCompare(y)).slice(0, limit);
  const keep = new Set(ranked);
  const outEdges = [...pairCounts]
    .map(([key, imports]) => {
      const [from = '', to = ''] = key.split('\u0000');
      return { from, to, imports };
    })
    .filter((e) => keep.has(e.from) && keep.has(e.to))
    .sort((x, y) => y.imports - x.imports || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  return { modules: ranked.sort().map((name) => ({ name, files: counts.get(name) ?? 0 })), edges: outEdges, fromRuntimeGraph };
}

// ── routes and API ──────────────────────────────────────────────────────────────────────────────

export interface PageRoute {
  route: string;
  path: string;
  framework: 'next-app' | 'next-pages' | 'react-router';
  component?: string;
}

export interface ApiRoute {
  method: string;
  route: string;
  path: string;
  framework: string;
  /** The handler visibly checks a session or token (identifier evidence, not a proof). */
  checksAuth: boolean;
  description?: string;
}

function nextRouteFromDir(dir: string): string {
  const segs = dir.split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return `/${segs.join('/')}`.replace(/\/+$/, '') || '/';
}

const AUTH_CHECK = /\b(getUser|getSession|getServerSession|auth\(\)|requireAuth|requireUser|currentUser|verifyToken|jwt\.verify|authorization|Authorization|withAuth|isAuthenticated|session)\b/;

export function extractRoutes(file: SourceFile): { pages: PageRoute[]; api: ApiRoute[] } {
  const pages: PageRoute[] = [];
  const api: ApiRoute[] = [];
  const p = file.path;
  const code = file.content;
  const appPage = /^(.*?)(?:^|\/)app\/(.*\/)?page\.(tsx|jsx|ts|js)$/.exec(p);
  if (appPage) pages.push({ route: nextRouteFromDir((appPage[2] ?? '').replace(/\/$/, '')), path: p, framework: 'next-app' });
  const pagesRouter = /(?:^|\/)pages\/(.+)\.(tsx|jsx|ts|js)$/.exec(p);
  if (pagesRouter && !/^(api\/|_app$|_document$|_error$)/.test(pagesRouter[1] ?? '') && /\.(tsx|jsx)$/.test(p)) {
    pages.push({ route: `/${(pagesRouter[1] ?? '').replace(/(^|\/)index$/, '')}`.replace(/\/+$/, '') || '/', path: p, framework: 'next-pages' });
  }
  const routeFile = /(?:^|\/)app\/(.*\/)?route\.(ts|js)$/.exec(p);
  if (routeFile) {
    const route = nextRouteFromDir((routeFile[1] ?? '').replace(/\/$/, ''));
    const methods = new Set<string>();
    const re = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) methods.add(m[1] ?? '');
    const exportList = /export\s*\{([^}]*)\}/.exec(code);
    if (exportList) for (const name of (exportList[1] ?? '').split(',')) {
      const alias = name.trim().split(/\s+as\s+/).pop()?.trim() ?? '';
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(alias)) methods.add(alias);
    }
    const checksAuth = AUTH_CHECK.test(code);
    const description = jsDocBefore(code, code.search(/export\s+(async\s+)?(function|const)\s+(GET|POST|PUT|PATCH|DELETE)/));
    for (const method of [...methods].sort()) api.push({ method, route, path: p, framework: 'Next.js route handler', checksAuth, description });
  }
  const pagesApi = /(?:^|\/)pages\/api\/(.+)\.(ts|js)$/.exec(p);
  if (pagesApi) {
    const route = `/api/${(pagesApi[1] ?? '').replace(/(^|\/)index$/, '')}`.replace(/\/+$/, '');
    const methods = [...new Set((code.match(/req\.method\s*===?\s*['"]([A-Z]+)['"]/g) ?? []).map((s) => /['"]([A-Z]+)['"]/.exec(s)?.[1] ?? ''))].filter(Boolean);
    for (const method of methods.length > 0 ? methods.sort() : ['ANY']) api.push({ method, route, path: p, framework: 'Next.js API route', checksAuth: AUTH_CHECK.test(code) });
  }
  if (/\.(ts|js|mjs|cjs)$/.test(p) && !/\.(test|spec)\./.test(p)) {
    const re = /\b(app|router|server|fastify|routes)\.(get|post|put|patch|delete)\(\s*['"`](\/[^'"`]*)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) api.push({ method: (m[2] ?? '').toUpperCase(), route: m[3] ?? '', path: p, framework: 'Express-style router', checksAuth: AUTH_CHECK.test(code.slice(m.index, m.index + 600)) });
  }
  if (/\.(tsx|jsx)$/.test(p)) {
    const re = /<Route\b[^>]*\bpath=\{?['"]([^'"]+)['"]\}?[^>]*?(?:element=\{\s*<([A-Z][A-Za-z0-9]*)|component=\{([A-Z][A-Za-z0-9]*)\})?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) pages.push({ route: m[1] ?? '', path: p, framework: 'react-router', component: m[2] ?? m[3] });
    const objRe = /\{\s*path:\s*['"]([^'"]+)['"]\s*,\s*element:\s*<([A-Z][A-Za-z0-9]*)/g;
    while ((m = objRe.exec(code))) pages.push({ route: m[1] ?? '', path: p, framework: 'react-router', component: m[2] });
  }
  return { pages, api };
}

/** Internal navigation targets a file links or redirects to. */
export function navigationTargets(code: string): string[] {
  const out = new Set<string>();
  const re = /(?:href=\{?|(?:router\.(?:push|replace)|navigate|redirect)\(\s*)['"`](\/[A-Za-z0-9_\-/[\]:]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const target = (m[1] ?? '').replace(/\/+$/, '') || '/';
    out.add(target);
  }
  return [...out].sort();
}

// ── database ────────────────────────────────────────────────────────────────────────────────────

export interface Column {
  name: string;
  type: string;
  primaryKey: boolean;
  unique: boolean;
  nullable: boolean;
  references?: string;
}

export interface Table {
  name: string;
  columns: Column[];
  source: string;
  rowLevelSecurity: boolean;
  policies: string[];
}

const TABLE_CONSTRAINT = /^(constraint\b|primary\s+key\b|foreign\s+key\b|unique\s*\(|check\s*\(|exclude\b)/i;

function cleanIdent(raw: string): string {
  const parts = raw.replace(/"/g, '').split('.');
  return parts[parts.length - 1] ?? raw;
}

function parseColumns(body: string, tableName: string, relations: { from: string; to: string; column: string }[]): Column[] {
  const columns: Column[] = [];
  for (const raw of splitTopLevel(stripSqlComments(body), [','])) {
    const def = collapseWhitespace(raw);
    if (!def) continue;
    if (TABLE_CONSTRAINT.test(def)) {
      const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(def);
      if (pk) for (const c of (pk[1] ?? '').split(',')) {
        const col = columns.find((x) => x.name === cleanIdent(c.trim()));
        if (col) col.primaryKey = true;
      }
      const fk = /foreign\s+key\s*\(([^)]*)\)\s*references\s+([\w."]+)/i.exec(def);
      if (fk) {
        const target = cleanIdent(fk[2] ?? '');
        for (const c of (fk[1] ?? '').split(',')) {
          const col = columns.find((x) => x.name === cleanIdent(c.trim()));
          if (col) col.references = target;
          relations.push({ from: tableName, to: target, column: cleanIdent(c.trim()) });
        }
      }
      continue;
    }
    const m = /^("?[\w]+"?)\s+([A-Za-z_][\w]*(?:\s+(?:precision|varying|with(?:out)?\s+time\s+zone))?(?:\s*\([^)]*\))?(?:\[\])?)([\s\S]*)$/i.exec(def);
    if (!m) continue;
    const rest = m[3] ?? '';
    const ref = /references\s+([\w."]+)/i.exec(rest);
    const column: Column = {
      name: cleanIdent(m[1] ?? ''),
      type: collapseWhitespace(m[2] ?? '').toLowerCase(),
      primaryKey: /primary\s+key/i.test(rest),
      unique: /\bunique\b/i.test(rest),
      nullable: !/not\s+null/i.test(rest) && !/primary\s+key/i.test(rest),
      references: ref ? cleanIdent(ref[1] ?? '') : undefined,
    };
    if (column.references) relations.push({ from: tableName, to: column.references, column: column.name });
    columns.push(column);
  }
  return columns;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export interface Schema {
  tables: Table[];
  relations: { from: string; to: string; column: string }[];
  sources: string[];
}

/** Applies SQL migrations in path order (create/alter/drop) and reads Prisma models. */
export function extractSchema(files: SourceFile[]): Schema {
  const tables = new Map<string, Table>();
  let relations: { from: string; to: string; column: string }[] = [];
  const sources: string[] = [];
  const sql = files.filter((f) => /\.sql$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sql) {
    const text = stripSqlComments(file.content);
    let touched = false;
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(text))) {
      const name = cleanIdent(m[1] ?? '');
      const body = balancedFrom(text, m.index + m[0].length - 1);
      if (!body) continue;
      relations = relations.filter((r) => r.from !== name);
      tables.set(name, { name, columns: parseColumns(body.inner, name, relations), source: file.path, rowLevelSecurity: false, policies: [] });
      touched = true;
    }
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+([\s\S]*?);/gi;
    while ((m = alterRe.exec(text))) {
      const table = tables.get(cleanIdent(m[1] ?? ''));
      if (!table) continue;
      const action = m[2] ?? '';
      for (const clause of splitTopLevel(action, [','])) {
        const add = /^\s*add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(clause);
        if (add && !/^\s*add\s+constraint/i.test(clause)) {
          const cols = parseColumns(add[1] ?? '', table.name, relations);
          for (const c of cols) table.columns = [...table.columns.filter((x) => x.name !== c.name), c];
          touched = true;
        }
        const addFk = /add\s+constraint\s+\S+\s+foreign\s+key\s*\(([^)]*)\)\s*references\s+([\w."]+)/i.exec(clause);
        if (addFk) {
          const target = cleanIdent(addFk[2] ?? '');
          for (const c of (addFk[1] ?? '').split(',')) {
            const col = table.columns.find((x) => x.name === cleanIdent(c.trim()));
            if (col) col.references = target;
            relations.push({ from: table.name, to: target, column: cleanIdent(c.trim()) });
          }
          touched = true;
        }
        const drop = /^\s*drop\s+column\s+(?:if\s+exists\s+)?([\w"]+)/i.exec(clause);
        if (drop) {
          const col = cleanIdent(drop[1] ?? '');
          table.columns = table.columns.filter((c) => c.name !== col);
          relations = relations.filter((r) => !(r.from === table.name && r.column === col));
          touched = true;
        }
      }
      if (/enable\s+row\s+level\s+security/i.test(action)) {
        table.rowLevelSecurity = true;
        touched = true;
      }
    }
    const dropRe = /drop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/gi;
    while ((m = dropRe.exec(text))) {
      const name = cleanIdent(m[1] ?? '');
      if (tables.delete(name)) touched = true;
      relations = relations.filter((r) => r.from !== name && r.to !== name);
    }
    const policyRe = /create\s+policy\s+("[^"]+"|\S+)\s+on\s+([\w."]+)(?:\s+as\s+\w+)?(?:\s+for\s+(\w+))?/gi;
    while ((m = policyRe.exec(text))) {
      const table = tables.get(cleanIdent(m[2] ?? ''));
      if (!table) continue;
      table.policies.push(`${(m[1] ?? '').replace(/"/g, '')}${m[3] ? ` (${m[3].toUpperCase()})` : ''}`);
      touched = true;
    }
    if (touched) sources.push(file.path);
  }
  for (const file of files.filter((f) => /\.prisma$/.test(f.path))) {
    const modelRe = /model\s+([A-Za-z_]\w*)\s*\{/g;
    let m: RegExpExecArray | null;
    const modelNames = new Set<string>();
    const tmp: RegExpExecArray[] = [];
    while ((m = modelRe.exec(file.content))) {
      modelNames.add(m[1] ?? '');
      tmp.push(m);
    }
    for (const match of tmp) {
      const name = match[1] ?? '';
      const body = balancedFrom(file.content, match.index + match[0].length - 1);
      if (!body) continue;
      const columns: Column[] = [];
      for (const line of body.inner.split('\n')) {
        const l = line.replace(/\/\/.*$/, '').trim();
        const f = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\[\])?(\?)?\s*(.*)$/.exec(l);
        if (!f || l.startsWith('@@')) continue;
        const type = f[2] ?? '';
        if (modelNames.has(type)) {
          const fields = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(f[5] ?? '');
          if (fields) relations.push({ from: name, to: type, column: (fields[1] ?? '').trim() });
          continue;
        }
        columns.push({ name: f[1] ?? '', type: `${type}${f[3] ?? ''}`, primaryKey: /@id\b/.test(f[5] ?? ''), unique: /@unique\b/.test(f[5] ?? ''), nullable: Boolean(f[4]) });
      }
      for (const r of relations.filter((x) => x.from === name)) {
        const col = columns.find((c) => c.name === r.column);
        if (col) col.references = r.to;
      }
      tables.set(name, { name, columns, source: file.path, rowLevelSecurity: false, policies: [] });
    }
    if (tmp.length > 0) sources.push(file.path);
  }
  const names = new Set(tables.keys());
  const uniq = new Map<string, { from: string; to: string; column: string }>();
  for (const r of relations) if (names.has(r.from) && names.has(r.to)) uniq.set(`${r.from}.${r.column}->${r.to}`, r);
  return { tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)), relations: [...uniq.values()], sources };
}

// ── auth, environment, tests, deployment, design ────────────────────────────────────────────────

const AUTH_SIGNALS: [string, RegExp][] = [
  ['Supabase Auth', /\bsupabase\.auth\.|@supabase\/(ssr|auth-helpers)/],
  ['NextAuth / Auth.js', /\bnext-auth\b|NextAuth\(|@auth\/core/],
  ['Clerk', /@clerk\//],
  ['Firebase Auth', /firebase\/auth|getAuth\(/],
  ['Auth0', /@auth0\//],
  ['Passport', /\bpassport\.(use|authenticate)\b/],
  ['JSON Web Tokens', /\bjsonwebtoken\b|\bjwt\.(sign|verify)\b|\bjose\b/],
  ['Password hashing', /\bbcrypt|argon2|scrypt\b/],
  ['OAuth sign-in', /signInWithOAuth|OAuth2|authorization_code|code_verifier|PKCE/i],
  ['Session cookies', /\b(iron-session|cookie-session|express-session)\b|cookies\(\)\.get\(\s*['"][^'"]*session/i],
];

export interface AuthEvidence {
  mechanisms: { name: string; files: string[] }[];
  middleware: string[];
}

export function extractAuth(files: SourceFile[]): AuthEvidence {
  const by = new Map<string, Set<string>>();
  const middleware: string[] = [];
  for (const file of files) {
    if (!CODE_FILE.test(file.path) || /\.(test|spec)\./.test(file.path)) continue;
    for (const [name, re] of AUTH_SIGNALS) if (re.test(file.content)) (by.get(name) ?? by.set(name, new Set()).get(name))?.add(file.path);
    if (/(^|\/)middleware\.(ts|js)$/.test(file.path)) middleware.push(file.path);
  }
  return { mechanisms: [...by].map(([name, set]) => ({ name, files: [...set].sort() })).sort((a, b) => a.name.localeCompare(b.name)), middleware: middleware.sort() };
}

/** Environment variable NAMES only — values are never read into documentation. */
export function extractEnvNames(files: SourceFile[]): { name: string; sources: string[] }[] {
  const by = new Map<string, Set<string>>();
  const add = (name: string, src: string) => (by.get(name) ?? by.set(name, new Set()).get(name))?.add(src);
  for (const file of files) {
    if (isSecretPath(file.path)) continue;
    if (isExampleEnvPath(file.path)) {
      for (const line of file.content.split('\n')) {
        const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
        if (m && m[1]) add(m[1], file.path);
      }
      continue;
    }
    if (!CODE_FILE.test(file.path)) continue;
    const re = /\b(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)\b|\bprocess\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content))) add(m[1] ?? m[2] ?? '', file.path);
  }
  by.delete('');
  by.delete('NODE_ENV');
  return [...by].map(([name, set]) => ({ name, sources: [...set].sort() })).sort((a, b) => a.name.localeCompare(b.name));
}

export function isTestPath(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)(__tests__|e2e|cypress)\//.test(path) || /(^|\/)test_[^/]+\.py$|_test\.(py|go)$/.test(path);
}

export interface TestEvidence {
  files: string[];
  frameworks: string[];
  scripts: Record<string, string>;
  configs: string[];
}

export function extractTests(paths: string[], packages: PackageInfo[]): TestEvidence {
  const frameworks = new Set<string>();
  const scripts: Record<string, string> = {};
  for (const pkg of packages) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of [['vitest', 'Vitest'], ['jest', 'Jest'], ['mocha', 'Mocha'], ['@playwright/test', 'Playwright'], ['cypress', 'Cypress'], ['@testing-library/react', 'Testing Library (React)'], ['pytest', 'pytest']] as const) {
      if (deps[dep] !== undefined) frameworks.add(label);
    }
    for (const [name, cmd] of Object.entries(pkg.scripts)) if (/test|e2e|lint|typecheck|check/i.test(name)) scripts[pkg.path === 'package.json' ? name : `${dirname(pkg.path)}: ${name}`] = cmd;
  }
  const configs = paths.filter((p) => /(^|\/)(vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s$|(^|\/)pytest\.ini$/.test(p)).sort();
  return { files: paths.filter(isTestPath).sort(), frameworks: [...frameworks].sort(), scripts, configs };
}

export interface DeployEvidence {
  files: { path: string; kind: string }[];
  workflows: { path: string; name?: string; steps: string[] }[];
  scripts: Record<string, string>;
}

const DEPLOY_FILES: [RegExp, string][] = [
  [/(^|\/)Dockerfile(\.[\w-]+)?$/, 'Docker image'],
  [/(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/, 'Docker Compose'],
  [/(^|\/)vercel\.json$/, 'Vercel'],
  [/(^|\/)netlify\.toml$/, 'Netlify'],
  [/(^|\/)fly\.toml$/, 'Fly.io'],
  [/(^|\/)render\.ya?ml$/, 'Render'],
  [/(^|\/)Procfile$/, 'Procfile (Heroku-style)'],
  [/(^|\/)app\.ya?ml$/, 'Google App Engine'],
  [/(^|\/)electron-builder\.(ya?ml|json|js)$/, 'Electron installer (electron-builder)'],
  [/(^|\/)supabase\/config\.toml$/, 'Supabase project config'],
  [/(^|\/)wrangler\.toml$/, 'Cloudflare Workers'],
  [/(^|\/)serverless\.ya?ml$/, 'Serverless Framework'],
];

export function extractDeployment(files: SourceFile[], paths: string[], packages: PackageInfo[]): DeployEvidence {
  const out: DeployEvidence = { files: [], workflows: [], scripts: {} };
  for (const p of paths) for (const [re, kind] of DEPLOY_FILES) if (re.test(p)) out.files.push({ path: p, kind });
  for (const file of files.filter((f) => /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(f.path))) {
    const name = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(file.content)?.[1]?.trim();
    const steps = [...new Set((file.content.match(/^\s*-?\s*run:\s*(.+)$/gm) ?? []).map((l) => collapseWhitespace(l.replace(/^\s*-?\s*run:\s*/, '')).slice(0, 100)))].slice(0, 8);
    out.workflows.push({ path: file.path, name, steps });
  }
  for (const pkg of packages) for (const [name, cmd] of Object.entries(pkg.scripts)) if (/^(build|start|deploy|release|package|preview|dist)/i.test(name)) out.scripts[pkg.path === 'package.json' ? name : `${dirname(pkg.path)}: ${name}`] = cmd;
  out.files.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export interface DesignEvidence {
  tokens: { name: string; value: string; source: string }[];
  libraries: string[];
  tailwindConfig?: string;
  fonts: string[];
  stylesheets: string[];
}

const UI_LIBRARIES: [string, string][] = [
  ['tailwindcss', 'Tailwind CSS'],
  ['@mui/material', 'MUI'],
  ['@chakra-ui/react', 'Chakra UI'],
  ['@radix-ui/react-dialog', 'Radix UI'],
  ['@headlessui/react', 'Headless UI'],
  ['styled-components', 'styled-components'],
  ['@emotion/react', 'Emotion'],
  ['antd', 'Ant Design'],
  ['bootstrap', 'Bootstrap'],
  ['lucide-react', 'Lucide icons'],
  ['framer-motion', 'Framer Motion'],
];

export function extractDesign(files: SourceFile[], paths: string[], packages: PackageInfo[]): DesignEvidence {
  const tokens: { name: string; value: string; source: string }[] = [];
  const fonts = new Set<string>();
  const stylesheets: string[] = [];
  for (const file of files) {
    if (!/\.(css|scss|sass|less)$/.test(file.path)) continue;
    stylesheets.push(file.path);
    const text = file.content.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && tokens.length < 200) {
      const name = m[1] ?? '';
      if (!tokens.some((t) => t.name === name)) tokens.push({ name, value: collapseWhitespace(m[2] ?? '').slice(0, 80), source: file.path });
    }
    for (const f of text.match(/font-family\s*:\s*([^;]+);/g) ?? []) fonts.add(collapseWhitespace(f.replace(/font-family\s*:\s*/, '').replace(/;$/, '')).slice(0, 80));
  }
  const libraries = new Set<string>();
  for (const pkg of packages) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of UI_LIBRARIES) if (deps[dep] !== undefined) libraries.add(label);
    if (Object.keys(deps).some((d) => d.startsWith('@radix-ui/'))) libraries.add('Radix UI');
  }
  if (paths.some((p) => /(^|\/)components\.json$/.test(p)) && libraries.has('Radix UI')) libraries.add('shadcn/ui (components.json)');
  return {
    tokens,
    libraries: [...libraries].sort(),
    tailwindConfig: paths.find((p) => /(^|\/)tailwind\.config\.[cm]?[jt]s$/.test(p)),
    fonts: [...fonts].slice(0, 10),
    stylesheets: stylesheets.sort(),
  };
}

// ── all evidence ────────────────────────────────────────────────────────────────────────────────

export interface Evidence {
  name: string;
  description?: string;
  rootPackage?: PackageInfo;
  packages: PackageInfo[];
  stack: string[];
  paths: string[];
  components: ComponentInfo[];
  pages: PageRoute[];
  api: ApiRoute[];
  navigation: { from: string; to: string }[];
  schema: Schema;
  auth: AuthEvidence;
  env: { name: string; sources: string[] }[];
  tests: TestEvidence;
  deploy: DeployEvidence;
  design: DesignEvidence;
  modules: ModuleGraph;
  features: { name: string; files: string[] }[];
  docs: string[];
  filesRead: number;
  truncated: boolean;
}

/** A route with dynamic segments ([id], :id) as a pattern that matches concrete paths. */
function routePattern(route: string): RegExp {
  const escaped = route
    .split('/')
    .map((seg) => (/^\[.+\]$/.test(seg) || /^:[A-Za-z_]\w*$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${escaped}$`);
}

export function collectEvidence(snapshot: ProjectSnapshot): Evidence {
  const files = snapshot.files.map((f) => ({ path: posix(f.path), content: f.content })).filter((f) => !isSecretPath(f.path));
  const paths = [...new Set([...(snapshot.allPaths ?? []).map(posix), ...files.map((f) => f.path)])].filter((p) => !/(^|\/)(node_modules|\.git)\//.test(p)).sort();
  const known = new Set(paths);
  const packages = files.filter((f) => /(^|\/)package\.json$/.test(f.path)).map(parsePackageJson).filter((p): p is PackageInfo => p !== null);
  const rootPackage = packages.find((p) => p.path === 'package.json');
  const components: ComponentInfo[] = [];
  const pages: PageRoute[] = [];
  const api: ApiRoute[] = [];
  const navigation: { from: string; to: string }[] = [];
  for (const file of files) {
    components.push(...extractComponents(file));
    const r = extractRoutes(file);
    pages.push(...r.pages);
    api.push(...r.api);
  }
  const edges = importEdges({ ...snapshot, files }, known);
  // Who renders each component: files that import its file and use its tag.
  const importers = new Map<string, string[]>();
  for (const [from, tos] of Object.entries(edges)) for (const to of tos) (importers.get(to) ?? importers.set(to, []).get(to))?.push(from);
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  for (const c of components) {
    c.usedBy = (importers.get(c.path) ?? []).filter((p) => new RegExp(`<${c.name}[\\s/>]`).test(byPath.get(p) ?? '')).sort();
  }
  // Page → page navigation (only between routes that exist).
  const routeSet = new Set(pages.map((p) => p.route));
  for (const page of pages.filter((p) => p.framework !== 'react-router')) {
    const sources = [page.path, ...(edges[page.path] ?? []).filter((p) => isComponentFile(p))];
    for (const src of sources) for (const target of navigationTargets(byPath.get(src) ?? '')) {
      const match = routeSet.has(target) ? target : [...routeSet].find((r) => routePattern(r).test(target));
      if (match && match !== page.route && !navigation.some((n) => n.from === page.route && n.to === match)) navigation.push({ from: page.route, to: match });
    }
  }
  const dedupPages = new Map<string, PageRoute>();
  for (const p of pages) if (!dedupPages.has(`${p.route}|${p.path}`)) dedupPages.set(`${p.route}|${p.path}`, p);
  const dedupApi = new Map<string, ApiRoute>();
  for (const a of api) if (!dedupApi.has(`${a.method} ${a.route}|${a.path}`)) dedupApi.set(`${a.method} ${a.route}|${a.path}`, a);
  return {
    name: rootPackage?.name ?? snapshot.name ?? 'This project',
    description: rootPackage?.description,
    rootPackage,
    packages,
    stack: detectStack(packages, paths),
    paths,
    components: components.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    pages: [...dedupPages.values()].sort((a, b) => a.route.localeCompare(b.route)),
    api: [...dedupApi.values()].sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method)),
    navigation: navigation.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    schema: extractSchema(files),
    auth: extractAuth(files),
    env: extractEnvNames(files),
    tests: extractTests(paths, packages),
    deploy: extractDeployment(files, paths, packages),
    design: extractDesign(files, paths, packages),
    modules: moduleGraph(edges, paths, Boolean(snapshot.dependencyEdges && Object.keys(snapshot.dependencyEdges).length > 0)),
    features: (snapshot.features ?? []).map((f) => ({ name: f.name, files: f.files.map(posix).sort() })).filter((f) => f.files.length > 0),
    docs: paths.filter((p) => /\.(md|mdx)$/i.test(p)),
    filesRead: files.length,
    truncated: Boolean(snapshot.truncated),
  };
}

export { basename };
