/**
 * A route/page/endpoint discovered by convention or by scanning a file — the seam Feature
 * Discovery (Coding Runtime V2 Phase 2) consumes. Defined here (not in FeatureMapBuilder) since
 * it's the shape a LanguageProvider itself produces.
 */
export type RouteCandidate = {
  filePath: string;
  httpPath?: string;
  method?: string;
};

export type SyntaxCheckResult = {
  ok: boolean;
  message?: string;
};

/**
 * The seam every piece of code-structure analysis in the Coding Runtime calls through, instead of
 * hardcoding TypeScript's compiler API directly — so a second language later is a new registered
 * provider, not a rewrite of the dependency graph, feature discovery, or edit-verification logic
 * that consume it. Optional methods let a lighter-weight future provider (e.g. a regex-only Python
 * provider) participate in import-graph construction without being required to support route
 * discovery or syntax checking — callers must treat a missing optional method as "not supported for
 * this language," never as an error, and report that honestly rather than silently skipping it.
 */
export interface LanguageProvider {
  id: string;

  /** Extension/shebang based, deterministic — never content-sniffed. */
  matchesFile(filePath: string): boolean;

  /** Best-effort raw module specifiers (e.g. './foo', 'react') — resolving them to real files on disk is the caller's job, not this method's. */
  extractImports(content: string, filePath: string): string[];

  /** Best-effort exported symbol names. Optional — a provider with no real export-extraction story simply omits this rather than fabricating an empty-but-confident answer. */
  extractExports?(content: string, filePath: string): string[];

  /** Framework-convention route/page/endpoint discovery (e.g. Next.js app-router file conventions, Express `router.get(...)`). Optional — most languages/frameworks this provider doesn't specifically know about should leave this unset. */
  detectRouteCandidates?(content: string, filePath: string, framework: string | null): RouteCandidate[];

  /** A cheap parse-only sanity check (no full type-checking) — used by the Multi-file Editing Engine's verify() step, not a substitute for the real Validation Pipeline. Optional. */
  syntaxCheck?(content: string, filePath: string): SyntaxCheckResult;
}
