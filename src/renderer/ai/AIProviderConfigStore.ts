import type { ReasoningProviderId } from '../reasoning/ReasoningProviderRegistry';

const STORAGE_KEY = 'pawos:ai:provider-config:v1';

export type AIProviderConfig = {
  activeProviderId: ReasoningProviderId;
  apiKeys: Partial<Record<ReasoningProviderId, string>>;
  models: Partial<Record<ReasoningProviderId, string>>;
};

function defaultConfig(): AIProviderConfig {
  return { activeProviderId: 'local', apiKeys: {}, models: {} };
}

function load(): AIProviderConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    // fall through to default
  }
  return defaultConfig();
}

function save(config: AIProviderConfig) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Persists which AI provider is active and its credentials. This is the
 * only place provider identity/config lives — the rest of the app (UI,
 * ConversationRuntime, Companion Lab) goes through AIRouter, never reading
 * this directly or naming a provider itself.
 */
export class AIProviderConfigStore {
  private config = load();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist() {
    save(this.config);
    this.listeners.forEach((l) => l());
  }

  get(): AIProviderConfig {
    return { ...this.config, apiKeys: { ...this.config.apiKeys }, models: { ...this.config.models } };
  }

  setApiKey(providerId: ReasoningProviderId, apiKey: string) {
    const previousKey = this.config.apiKeys[providerId];
    this.config = { ...this.config, apiKeys: { ...this.config.apiKeys, [providerId]: apiKey } };
    // Configuring a *new or changed* key for a cloud provider makes it
    // active automatically — this is how Gemini becomes primary once the
    // user supplies a key, without a separate "set active" step. Re-reading
    // the same already-stored key (as happens on every app launch, since
    // .env is re-applied each time) must NOT re-trigger this — otherwise a
    // deliberate switch to another provider (e.g. a local fallback while
    // Gemini credits are exhausted) would silently reset on next relaunch.
    if (apiKey.trim() && apiKey !== previousKey) {
      this.config.activeProviderId = providerId;
    }
    this.persist();
  }

  setModel(providerId: ReasoningProviderId, model: string) {
    this.config = { ...this.config, models: { ...this.config.models, [providerId]: model } };
    this.persist();
  }

  setActiveProvider(providerId: ReasoningProviderId) {
    this.config = { ...this.config, activeProviderId: providerId };
    this.persist();
  }

  getApiKey(providerId: ReasoningProviderId): string | undefined {
    return this.config.apiKeys[providerId];
  }
}

export const aiProviderConfigStore = new AIProviderConfigStore();
