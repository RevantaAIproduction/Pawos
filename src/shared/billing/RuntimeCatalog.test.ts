import { describe, expect, it } from 'vitest';
import { getRuntimeCatalogItem, isRuntimePurchasable } from './RuntimeCatalog';

describe('RuntimeCatalog', () => {
  it('exposes Coding as the only purchasable production-capable runtime today', () => {
    expect(getRuntimeCatalogItem('coding')).toMatchObject({
      displayName: 'Coding Runtime',
      availability: 'available',
      purchasable: true,
      implementationStatus: 'production-capable',
    });

    for (const runtimeId of ['office', 'browser', 'communication', 'infrastructure', 'companion', 'governance', 'sales', 'hr'] as const) {
      expect(getRuntimeCatalogItem(runtimeId)?.purchasable).toBe(false);
    }
  });

  it('allows Coding purchases only for individual paid tiers', () => {
    expect(isRuntimePurchasable('coding', 'pro')).toBe(true);
    expect(isRuntimePurchasable('coding', 'proMax')).toBe(true);
    expect(isRuntimePurchasable('coding', 'go')).toBe(false);
    expect(isRuntimePurchasable('coding', 'team')).toBe(false);
  });
});
