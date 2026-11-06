/**
 * Change impact: which documents a set of real file changes affects. Triggers (Desktop's change
 * ledger, Web Code mode's edits, the CLI agent's writes) feed their actual changed paths through
 * here; nothing is triggered by a request's wording alone.
 */

import type { DocId, FileChange } from './types';
import { isComponentFile, isPagePath, isTestPath, isWidgetPath } from './evidence';
import { isSecretPath } from './secrets';

export interface DocImpact {
  doc: DocId;
  reason: string;
  /** The changed files that caused it. */
  paths: string[];
}

const RULES: { doc: DocId; reason: string; test: (path: string) => boolean }[] = [
  { doc: 'components', reason: 'a component changed', test: (p) => isComponentFile(p) && !isWidgetPath(p) && !isPagePath(p) },
  { doc: 'widgets', reason: 'a widget changed', test: (p) => isComponentFile(p) && isWidgetPath(p) },
  { doc: 'pages', reason: 'a page or route changed', test: (p) => isPagePath(p) || /(^|\/)(routes|router)\.(tsx|jsx|ts|js)$/.test(p) },
  { doc: 'ui-flows', reason: 'a page changed', test: (p) => isPagePath(p) },
  { doc: 'design-system', reason: 'styles or theme changed', test: (p) => /\.(css|scss|sass|less)$/.test(p) || /(^|\/)(tailwind\.config\.[cm]?[jt]s|theme\.[jt]sx?|tokens?\.[jt]s(on)?)$/.test(p) },
  { doc: 'api', reason: 'an API handler changed', test: (p) => /(^|\/)app\/(.*\/)?route\.(ts|js)$/.test(p) || /(^|\/)pages\/api\//.test(p) || /(^|\/)(routes|controllers|api)\/[^/]+\.(ts|js)$/.test(p) },
  { doc: 'database', reason: 'the database schema changed', test: (p) => /\.sql$/i.test(p) || /\.prisma$/.test(p) || /(^|\/)(schema|models?)\.(ts|js)$/.test(p) },
  { doc: 'auth', reason: 'authentication code changed', test: (p) => /(^|\/)(auth|login|session|middleware|oauth|permissions?)([./-]|\/)/i.test(p) },
  { doc: 'testing', reason: 'tests or test configuration changed', test: (p) => isTestPath(p) || /(^|\/)(vitest|jest|playwright|cypress)\.config\./.test(p) },
  { doc: 'deployment', reason: 'build or deployment configuration changed', test: (p) => /(^|\/)(Dockerfile|Procfile|vercel\.json|netlify\.toml|fly\.toml|electron-builder\.(ya?ml|json))$/.test(p) || /(^|\/)\.github\/workflows\//.test(p) || /(^|\/)(docker-)?compose\./.test(p) },
  { doc: 'readme', reason: 'package scripts or dependencies changed', test: (p) => /(^|\/)package\.json$/.test(p) || /(^|\/)\.env\.(example|sample|template)$/.test(p) },
  { doc: 'architecture', reason: 'files were added, removed or package dependencies changed', test: (p) => /(^|\/)package\.json$/.test(p) },
];

function isDocPath(path: string): boolean {
  return /\.(md|mdx|mmd)$/i.test(path);
}

export function detectDocImpact(changes: FileChange[]): DocImpact[] {
  const by = new Map<DocId, DocImpact>();
  const add = (doc: DocId, reason: string, path: string) => {
    const hit = by.get(doc) ?? by.set(doc, { doc, reason, paths: [] }).get(doc);
    if (hit && !hit.paths.includes(path)) hit.paths.push(path);
  };
  for (const change of changes) {
    const path = change.path.replace(/\\/g, '/');
    if (isDocPath(path) || isSecretPath(path)) continue;
    for (const rule of RULES) if (rule.test(path)) add(rule.doc, rule.reason, path);
    // A new or deleted source file changes the shape of the code.
    if (change.kind !== 'modified' && /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/.test(path) && !isTestPath(path)) add('architecture', 'files were added or removed', path);
    if (/(^|\/)package\.json$/.test(path)) {
      add('testing', 'package scripts changed', path);
      add('deployment', 'package scripts changed', path);
    }
  }
  return [...by.values()].map((i) => ({ ...i, paths: i.paths.sort() })).sort((a, b) => a.doc.localeCompare(b.doc));
}
