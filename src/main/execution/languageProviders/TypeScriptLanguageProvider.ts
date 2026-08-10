import * as path from 'path';
import * as ts from 'typescript';
import type { LanguageProvider, RouteCandidate, SyntaxCheckResult } from './LanguageProvider';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Next.js app-router / pages-router conventions — file *path* alone tells us the route, no content
// scan needed. Matched against a path already normalized to forward slashes.
const APP_ROUTER_PAGE = /(^|\/)app\/(.*)\/page\.(t|j)sx?$/;
const APP_ROUTER_ROUTE = /(^|\/)app\/(.*)\/route\.(t|j)s$/;
const PAGES_ROUTER_API = /(^|\/)pages\/api\/(.*)\.(t|j)s$/;
const PAGES_ROUTER_PAGE = /(^|\/)pages\/(?!api\/)(.*)\.(t|j)sx?$/;

// Express/NestJS/generic router method calls and decorators — content-based, not path-based.
const EXPRESS_ROUTE = /\b(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const NEST_ROUTE = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'")`]*)['"`]?\s*\)/g;
const REACT_ROUTER_ROUTE = /<Route\s+[^>]*\bpath\s*=\s*\{?['"`]([^'"`]+)['"`]/g;

const EXPORT_PATTERNS: RegExp[] = [
  /export\s+default\s+(?:async\s+)?function\s+(\w+)/g,
  /export\s+default\s+class\s+(\w+)/g,
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  /export\s+class\s+(\w+)/g,
  /export\s+const\s+(\w+)/g,
  /export\s+let\s+(\w+)/g,
  /export\s+interface\s+(\w+)/g,
  /export\s+type\s+(\w+)/g,
];
const EXPORT_BRACE_PATTERN = /export\s*\{([^}]+)\}/g;
const EXPORT_DEFAULT_ANONYMOUS = /export\s+default\s+(?!function\b|class\b)/;

function toRoutePath(segments: string): string {
  // Next.js dynamic segments ([id], [...slug]) and route groups ((group)) already look like real
  // URL syntax once we drop the trailing filename — this is display-only, never used for real
  // routing, so we don't need to resolve dynamic segments further.
  const cleaned = segments
    .split('/')
    .filter((seg) => !/^\(.*\)$/.test(seg)) // route groups don't appear in the real URL
    .join('/');
  return `/${cleaned}`.replace(/\/+/g, '/');
}

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function detectExports(content: string): string[] {
  const names = new Set<string>();
  for (const pattern of EXPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      if (match[1]) names.add(match[1]);
    }
  }
  EXPORT_BRACE_PATTERN.lastIndex = 0;
  let braceMatch: RegExpExecArray | null;
  while ((braceMatch = EXPORT_BRACE_PATTERN.exec(content))) {
    for (const part of braceMatch[1]?.split(',') ?? []) {
      // `export { a, b as renamedB }` — the *exported* (public) name is whichever comes after
      // `as` when present, not the original local binding.
      const segments = part.split(/\s+as\s+/i).map((s) => s.trim());
      const exportedName = segments[segments.length - 1];
      if (exportedName) names.add(exportedName);
    }
  }
  if (EXPORT_DEFAULT_ANONYMOUS.test(content)) names.add('default');
  return [...names];
}

function detectFrameworkRoutes(content: string, filePath: string): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];

  EXPRESS_ROUTE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPRESS_ROUTE.exec(content))) {
    candidates.push({ filePath, httpPath: m[2], method: m[1]?.toUpperCase() });
  }

  NEST_ROUTE.lastIndex = 0;
  while ((m = NEST_ROUTE.exec(content))) {
    candidates.push({ filePath, httpPath: m[2] || '/', method: m[1]?.toUpperCase() });
  }

  REACT_ROUTER_ROUTE.lastIndex = 0;
  while ((m = REACT_ROUTER_ROUTE.exec(content))) {
    candidates.push({ filePath, httpPath: m[1] });
  }

  return candidates;
}

/**
 * The only LanguageProvider implementation shipped in Phase 1. Wraps the TypeScript compiler's
 * lightweight `preProcessFile`/`transpileModule` entry points (never the heavier `createProgram`,
 * which needs full type-checking) plus deterministic path/regex conventions for
 * Next.js/Express/NestJS/React Router route discovery. Only `extractImports` is actually called by
 * anything in Phase 1 (DependencyGraphWorker) — `detectRouteCandidates`/`syntaxCheck` exist now so
 * Feature Discovery (Phase 2) and the Multi-file Editing Engine (later phase) don't need to revisit
 * this file when they're built.
 */
class TypeScriptLanguageProvider implements LanguageProvider {
  id = 'typescript';

  matchesFile(filePath: string): boolean {
    return EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  extractImports(content: string, filePath: string): string[] {
    try {
      const info = ts.preProcessFile(content, /* readImportFiles */ true, /* detectJavaScriptImports */ true);
      const specifiers = new Set<string>();
      for (const imported of info.importedFiles) specifiers.add(imported.fileName);
      for (const ambient of info.ambientExternalModules ?? []) specifiers.add(ambient);
      return [...specifiers];
    } catch {
      // A file that fails to even lightly pre-process (encoding issue, truncated content) yields
      // no imports rather than a fabricated guess — the caller records this file as having no
      // traced edges, not as "definitely has no imports."
      void filePath;
      return [];
    }
  }

  extractExports(content: string, _filePath: string): string[] {
    return detectExports(content);
  }

  detectRouteCandidates(content: string, filePath: string, framework: string | null): RouteCandidate[] {
    const normalized = normalize(filePath);
    const candidates: RouteCandidate[] = [];

    if (framework === 'Next.js') {
      const pageMatch = normalized.match(APP_ROUTER_PAGE);
      if (pageMatch) candidates.push({ filePath, httpPath: toRoutePath(pageMatch[2] ?? ''), method: 'GET' });
      const routeMatch = normalized.match(APP_ROUTER_ROUTE);
      if (routeMatch) candidates.push({ filePath, httpPath: toRoutePath(routeMatch[2] ?? '') });
      const apiMatch = normalized.match(PAGES_ROUTER_API);
      if (apiMatch) candidates.push({ filePath, httpPath: `/api/${apiMatch[2]}` });
      const pagesMatch = !apiMatch && normalized.match(PAGES_ROUTER_PAGE);
      if (pagesMatch) candidates.push({ filePath, httpPath: toRoutePath(pagesMatch[2] ?? ''), method: 'GET' });
    }

    candidates.push(...detectFrameworkRoutes(content, filePath));
    return candidates;
  }

  syntaxCheck(content: string, filePath: string): SyntaxCheckResult {
    try {
      const isJsx = /\.(tsx|jsx)$/i.test(filePath);
      // `jsx` must be omitted entirely for non-JSX files — TypeScript's `--jsx` option only
      // accepts the real emit modes (preserve/react/react-jsx/...), not a "none" sentinel; passing
      // JsxEmit.None explicitly is itself reported as an invalid-option diagnostic.
      const compilerOptions: ts.CompilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest };
      if (isJsx) compilerOptions.jsx = ts.JsxEmit.Preserve;
      const result = ts.transpileModule(content, {
        compilerOptions,
        reportDiagnostics: true,
        fileName: filePath,
      });
      const errors = (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
      if (errors.length === 0) return { ok: true };
      const first = errors[0];
      const message = first ? ts.flattenDiagnosticMessageText(first.messageText, '\n') : 'Syntax error.';
      return { ok: false, message };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Failed to parse file.' };
    }
  }
}

export const typeScriptLanguageProvider = new TypeScriptLanguageProvider();
