import type { LanguageProvider } from './LanguageProvider';

/**
 * Open-registration seam for per-language analysis — the same `Map`-keyed, register-then-dispatch
 * shape as RequirementGate's `Map<RequirementKind, RequirementResolver>`. A future language is a
 * new `registerProvider()` call at startup, never a change to this class or to any of its callers
 * (DependencyGraphWorker, FeatureMapBuilder, ApplyCodeEditPlugin).
 */
class LanguageProviderRegistry {
  private providers = new Map<string, LanguageProvider>();

  registerProvider(provider: LanguageProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** First registered provider whose matchesFile() matches — undefined means "no analysis possible for this file," which callers must report honestly rather than guessing. */
  getProviderForFile(filePath: string): LanguageProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.matchesFile(filePath)) return provider;
    }
    return undefined;
  }

  list(): LanguageProvider[] {
    return [...this.providers.values()];
  }
}

export const languageProviderRegistry = new LanguageProviderRegistry();
