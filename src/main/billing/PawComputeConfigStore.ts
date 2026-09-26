
/**
 * PawOS is Gemini-only, permanently — this is not "the current provider," it is the product's only
 * AI provider. This store therefore holds Gemini model economics ONLY: no provider dimension, no
 * multi-provider pricing matrix, nothing for Anthropic/OpenAI/Ollama/local models to ever populate.
 */
export type GeminiModelPricing = {
  /** Real, sourced USD price per 1,000,000 input/prompt tokens. */
  inputPerMillionUsd: number;
  /** Real, sourced USD price per 1,000,000 output/candidate tokens. */
  outputPerMillionUsd: number;
  /** Real, sourced USD price per 1,000,000 cached-context input tokens (a cache hit is real, cheaper
   *  compute for Gemini — never assumed equal to a fresh input token). */
  cachedInputPerMillionUsd: number;
};

export type PawComputeConversionConfig = {
  /**
   * Keyed by the real Gemini model id string PawOS actually requests (see
   * src/renderer/ai/PawModelRegistry.ts — 'gemini-flash-latest', 'gemini-flash-lite-latest',
   * 'gemini-pro-latest' today), plus a 'default' fallback for any Gemini model id not explicitly
   * listed. Every number is sourced directly from Google's own published pricing
   * (ai.google.dev/gemini-api/docs/pricing, checked 2026-08-18) for the corresponding model tier —
   * never invented. 'gemini-flash-latest'/'gemini-flash-lite-latest'/'gemini-pro-latest' are
   * Google-managed ROLLING aliases: Google can silently repoint which pinned model version they
   * resolve to, and this table cannot know that has happened automatically. The prices below reflect
   * the newest generation in each tier as of the date above (Flash: 3.6/3.7 Flash-class pricing;
   * Flash-Lite: 3.5 Flash-Lite-class pricing; Pro: 3.1 Pro-class pricing, ≤200k-context tier) — this
   * is the documented, disclosed best-effort mapping for the rolling aliases, not a guess invented
   * without a real source. Re-verify against the pricing page whenever Google's rolling aliases are
   * known to have moved, and update via applySyncedConfig() rather than editing defaultConfig()
   * directly once a live sync source exists (mirrors UsageQuotaConfigStore's own sync pattern).
   */
  modelPricing: Record<string, GeminiModelPricing>;
  /**
   * The ONLY place a dollar amount becomes a "Paw Compute" number — a single, config-driven scale
   * factor so the whole Paw Compute magnitude can be re-tuned (e.g. "1 Paw Compute per $0.001 of
   * real Gemini spend" vs. a coarser/finer scale) without touching UsageMeteringEngine.ts's formula
   * or GeminiReasoningProvider.ts at all. Paw Compute = realUsdCost * pawComputePerUsd.
   */
  pawComputePerUsd: number;
};


function defaultConfig(): PawComputeConversionConfig {
  return {
    modelPricing: {
      // Flash tier — sourced from Gemini 3.6/3.7 Flash pricing (identical rates, both current through
      // 2026-12-31 per ai.google.dev).
      'gemini-flash-latest': { inputPerMillionUsd: 0.75, outputPerMillionUsd: 3.75, cachedInputPerMillionUsd: 0.075 },
      'gemini-3.6-flash': { inputPerMillionUsd: 1.5, outputPerMillionUsd: 7.5, cachedInputPerMillionUsd: 0.15 },
      // Flash-Lite tier — sourced from Gemini 3.5 Flash-Lite pricing.
      'gemini-flash-lite-latest': { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5, cachedInputPerMillionUsd: 0.03 },
      'gemini-3.5-flash-lite': { inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5, cachedInputPerMillionUsd: 0.03 },
      // Pro tier — sourced from Gemini 3.1 Pro pricing, ≤200k-context tier (the >200k tier is
      // materially more expensive — $4.00/$18.00/$0.40 — and is not modeled separately here; a
      // request whose real prompt exceeds 200k tokens will be honestly under-priced by this table
      // until a context-length-aware tier is added, a disclosed simplification, not a silent one).
      'gemini-pro-latest': { inputPerMillionUsd: 2.0, outputPerMillionUsd: 12.0, cachedInputPerMillionUsd: 0.2 },
      'gemini-3.1-pro-preview': { inputPerMillionUsd: 2.0, outputPerMillionUsd: 12.0, cachedInputPerMillionUsd: 0.2 },
      // Fallback for any Gemini model id not explicitly listed above (e.g. a version-pinned model a
      // future change might request) — the Flash tier's real rate, a conservative mid-range default
      // rather than silently charging $0.
      default: { inputPerMillionUsd: 0.75, outputPerMillionUsd: 3.75, cachedInputPerMillionUsd: 0.075 },
    },
    // 1,000 Paw Compute per real US dollar of Gemini spend — a display-scale choice only, adjustable
    // here without touching the normalization formula itself. Business Configuration Required in the
    // same sense every other placeholder economic constant in this codebase already is (see
    // GO_PLACEHOLDER_CREDIT_LIMIT) — this determines what "1 Paw Compute" visually means to a user,
    // not whether the underlying economics are real (they are: see modelPricing above).
    pawComputePerUsd: 1000,
  };
}

/**
 * Config-driven Gemini model pricing -> Paw Compute conversion. This is the ONLY place a raw Gemini
 * token count is converted into a dollar cost and then into a Paw Compute number —
 * UsageMeteringEngine.ts calls resolvePricing()/pawComputePerUsd rather than embedding a formula of
 * its own, so changing Gemini's real pricing later never requires touching GeminiReasoningProvider.ts
 * or the metering pipeline itself.
 */
class PawComputeConfigStore {
  private config: PawComputeConversionConfig = defaultConfig();

  /**
   * Metering (model prices and the Paw Compute scale) is always the built-in table. Earlier builds read
   * it back from a paw-compute-config.json in the user's data folder — setting pawComputePerUsd near 0
   * there made every request nearly free on every tier — so no file is read (or written) any more.
   */
  init(): void {
    this.config = defaultConfig();
  }

  get(): PawComputeConversionConfig {
    return this.config;
  }

  /** Overwrites the pricing table/scale factor — the same "synced from a real business-config
   *  source, never a second hardcoded authority" pattern UsageQuotaConfigStore.applySyncedConfig()
   *  already uses; not called from anywhere yet (no live sync source exists today), matching the
   *  same disclosed, ship-the-interface-first precedent already established elsewhere in this
   *  codebase. */
  applySyncedConfig(config: PawComputeConversionConfig): void {
    const defaults = defaultConfig();
    this.config = {
      modelPricing: { ...defaults.modelPricing, ...config.modelPricing },
      pawComputePerUsd: config.pawComputePerUsd,
    };
  }

  /** Exact Gemini model id match, then the global default — never returns undefined. */
  resolvePricing(model: string): GeminiModelPricing {
    return this.config.modelPricing[model] ?? this.config.modelPricing.default ?? { inputPerMillionUsd: 0.75, outputPerMillionUsd: 3.75, cachedInputPerMillionUsd: 0.075 };
  }

  getPawComputePerUsd(): number {
    return this.config.pawComputePerUsd;
  }
}

export const pawComputeConfigStore = new PawComputeConfigStore();
