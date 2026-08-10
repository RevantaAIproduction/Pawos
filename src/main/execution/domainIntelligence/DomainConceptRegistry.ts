import type { RouteCandidate } from '../languageProviders/LanguageProvider';

/** What a `DomainConceptPack` needs to decide whether its concept is present — real, already-gathered project facts, never re-derived by the pack itself. */
export type DomainConceptDetectionInput = {
  /** Merged `dependencies` + `devDependencies` from package.json. */
  dependencies: Record<string, string>;
  /** Every real code file the dependency graph knows about, forward-slash normalized. */
  filePaths: string[];
  /** Real traced routes (Phase 2, §6) — the only source of `method` data a pack can use for structural evidence like a CRUD quad. */
  routeCandidates: RouteCandidate[];
};

export type DomainConceptMatch = {
  conceptId: string;
  label: string;
  /** Files that evidence this concept — capped by the pack itself, never unbounded. */
  files: string[];
  /** Human-readable evidence, mirroring `AnalyzeFileImpactPlugin`'s honesty discipline — never claims more than what was actually checked. */
  evidence: string;
  confidence: number;
};

/**
 * A pluggable domain-vocabulary pack (Coding Runtime V2, §9) — reasons about an arbitrary
 * *third-party* project a user points PawOS at, never PawOS's own business domain. Every pack must
 * require real structural evidence (a dependency, a path convention, a route pattern), never a
 * vocabulary word alone — `detect()` returns `null` when no real evidence exists, rather than a
 * low-confidence guess.
 */
export interface DomainConceptPack {
  id: string;
  label: string;
  detect(input: DomainConceptDetectionInput): DomainConceptMatch | null;
}

/**
 * Open-registration seam for domain-vocabulary packs — the same `Map`-keyed, register-then-dispatch
 * shape as `RequirementGate`'s `Map<RequirementKind, RequirementResolver>` and
 * `LanguageProviderRegistry`'s `Map<string, LanguageProvider>`. A future pack (e.g. `notifications`,
 * `search`) is a new `registerPack()` call at startup, never a change to this class or to
 * `DetectDomainConceptsPlugin`.
 */
class DomainConceptRegistry {
  private packs = new Map<string, DomainConceptPack>();

  registerPack(pack: DomainConceptPack): void {
    this.packs.set(pack.id, pack);
  }

  getPack(id: string): DomainConceptPack | undefined {
    return this.packs.get(id);
  }

  list(): DomainConceptPack[] {
    return [...this.packs.values()];
  }
}

export const domainConceptRegistry = new DomainConceptRegistry();
