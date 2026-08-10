import type { DomainConceptDetectionInput, DomainConceptMatch, DomainConceptPack } from './DomainConceptRegistry';

// Caps how many evidence files a single concept match reports — mirrors
// FeatureMapBuilder's MAX_FILES_PER_FEATURE cap discipline rather than dumping every match.
const MAX_EVIDENCE_FILES = 50;

function capFiles(files: Iterable<string>): string[] {
  return [...new Set(files)].sort().slice(0, MAX_EVIDENCE_FILES);
}

/**
 * Dependency- or path-convention-based detection shared by `auth`/`billing` — real structural
 * evidence only (a real dependency in package.json, or a real file path matching the concept's
 * naming convention), never a vocabulary word alone. Returns `null` (not a low-confidence guess)
 * when neither signal is present.
 */
function detectByDepsOrPaths(
  input: DomainConceptDetectionInput,
  conceptId: string,
  label: string,
  deps: string[],
  pathPattern: RegExp
): DomainConceptMatch | null {
  const matchedDep = deps.find((dep) => Boolean(input.dependencies[dep]));
  const matchedFiles = input.filePaths.filter((p) => pathPattern.test(p));
  if (!matchedDep && matchedFiles.length === 0) return null;

  const evidenceParts: string[] = [];
  if (matchedDep) evidenceParts.push(`dependency "${matchedDep}"`);
  if (matchedFiles.length > 0) {
    evidenceParts.push(`${matchedFiles.length} file path${matchedFiles.length === 1 ? '' : 's'} matching the "${label}" convention`);
  }

  // Both signals agreeing is stronger evidence than either alone — never higher than 0.8, since
  // this is still convention-based, not a certainty.
  const confidence = matchedDep && matchedFiles.length > 0 ? 0.8 : matchedDep ? 0.6 : 0.4;

  return {
    conceptId,
    label,
    files: capFiles(matchedFiles),
    evidence: `Found ${evidenceParts.join(' and ')}.`,
    confidence,
  };
}

const AUTH_DEPS = ['next-auth', 'passport', 'jsonwebtoken', '@supabase/supabase-js'];
const AUTH_PATH_PATTERN = /auth|session|login/i;

export const authConceptPack: DomainConceptPack = {
  id: 'auth',
  label: 'Authentication',
  detect: (input) => detectByDepsOrPaths(input, 'auth', 'Authentication', AUTH_DEPS, AUTH_PATH_PATTERN),
};

const BILLING_DEPS = ['stripe', '@stripe/stripe-js'];
const BILLING_PATH_PATTERN = /billing|subscription|payment/i;

export const billingConceptPack: DomainConceptPack = {
  id: 'billing',
  label: 'Billing',
  detect: (input) => detectByDepsOrPaths(input, 'billing', 'Billing', BILLING_DEPS, BILLING_PATH_PATTERN),
};

// The plan's own evidence bar for crudResource: a route/controller forming a *full* GET+POST+PUT+
// DELETE quad against the same base path — a real structural pattern from RouteCandidate.method
// data, never a guess. Only route candidates carrying a real `method` contribute; frameworks whose
// route discovery doesn't populate `method` (e.g. a Next.js app-router route.ts, which registers one
// candidate per file with no method) honestly never match here — a real, narrower coverage than an
// idealized "detect CRUD anywhere" would want, consistent with using only real available data.
const CRUD_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

export const crudResourceConceptPack: DomainConceptPack = {
  id: 'crudResource',
  label: 'CRUD Resource',
  detect(input) {
    const methodsByPath = new Map<string, Set<string>>();
    const filesByPath = new Map<string, Set<string>>();

    for (const rc of input.routeCandidates) {
      if (!rc.httpPath || !rc.method) continue;
      const method = rc.method.toUpperCase();
      if (!CRUD_METHODS.includes(method)) continue;
      if (!methodsByPath.has(rc.httpPath)) methodsByPath.set(rc.httpPath, new Set());
      methodsByPath.get(rc.httpPath)?.add(method);
      if (!filesByPath.has(rc.httpPath)) filesByPath.set(rc.httpPath, new Set());
      filesByPath.get(rc.httpPath)?.add(rc.filePath.replace(/\\/g, '/'));
    }

    const matchedPaths: string[] = [];
    const matchedFiles = new Set<string>();
    for (const [httpPath, methods] of methodsByPath) {
      if (CRUD_METHODS.every((m) => methods.has(m))) {
        matchedPaths.push(httpPath);
        for (const f of filesByPath.get(httpPath) ?? []) matchedFiles.add(f);
      }
    }

    if (matchedPaths.length === 0) return null;

    const sortedPaths = matchedPaths.sort();
    const pathSummary = sortedPaths.length === 1 ? `"${sortedPaths[0]}"` : `${sortedPaths.length} paths (${sortedPaths.slice(0, 3).join(', ')}${sortedPaths.length > 3 ? ', …' : ''})`;

    return {
      conceptId: 'crudResource',
      label: 'CRUD Resource',
      files: capFiles(matchedFiles),
      evidence: `Found a full GET+POST+PUT+DELETE route quad at ${pathSummary}.`,
      confidence: 0.7,
    };
  },
};

export const BUILTIN_DOMAIN_CONCEPT_PACKS: DomainConceptPack[] = [authConceptPack, billingConceptPack, crudResourceConceptPack];
