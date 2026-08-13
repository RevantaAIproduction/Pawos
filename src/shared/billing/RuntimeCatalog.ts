import type { RuntimeEntitlementId, SubscriptionTierId } from './BillingTypes';

export type RuntimeImplementationStatus = 'production-capable' | 'partial' | 'frozen-partial' | 'not-implemented';
export type RuntimeAvailability = 'available' | 'deferred';

export type RuntimeCatalogItem = {
  id: RuntimeEntitlementId;
  displayName: string;
  availability: RuntimeAvailability;
  purchasable: boolean;
  supportedTiers: SubscriptionTierId[];
  implementationStatus: RuntimeImplementationStatus;
  priceKey?: string;
};

export const ALL_RUNTIME_ENTITLEMENT_IDS: RuntimeEntitlementId[] = [
  'coding',
  'office',
  'browser',
  'communication',
  'infrastructure',
  'companion',
  'governance',
  'sales',
  'hr',
];

export const RUNTIME_CATALOG: RuntimeCatalogItem[] = [
  {
    id: 'coding',
    displayName: 'Coding Runtime',
    availability: 'available',
    purchasable: true,
    supportedTiers: ['pro', 'proMax'],
    implementationStatus: 'production-capable',
    priceKey: 'runtime.coding.monthly',
  },
  {
    id: 'office',
    displayName: 'Office Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['pro', 'proMax'],
    implementationStatus: 'partial',
  },
  {
    id: 'browser',
    displayName: 'Browser Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['pro', 'proMax'],
    implementationStatus: 'partial',
  },
  {
    id: 'communication',
    displayName: 'Communication Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['pro', 'proMax'],
    implementationStatus: 'frozen-partial',
  },
  {
    id: 'infrastructure',
    displayName: 'Infrastructure Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['pro', 'proMax', 'team', 'enterprise'],
    implementationStatus: 'partial',
  },
  {
    id: 'companion',
    displayName: 'Companion Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['pro', 'proMax'],
    implementationStatus: 'partial',
  },
  {
    id: 'governance',
    displayName: 'Governance Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['team', 'enterprise'],
    implementationStatus: 'partial',
  },
  {
    id: 'sales',
    displayName: 'Sales Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['team', 'enterprise'],
    implementationStatus: 'not-implemented',
  },
  {
    id: 'hr',
    displayName: 'HR Runtime',
    availability: 'deferred',
    purchasable: false,
    supportedTiers: ['team', 'enterprise'],
    implementationStatus: 'not-implemented',
  },
];

export function getRuntimeCatalogItem(runtimeId: RuntimeEntitlementId): RuntimeCatalogItem | undefined {
  return RUNTIME_CATALOG.find((runtime) => runtime.id === runtimeId);
}

export function isRuntimePurchasable(runtimeId: RuntimeEntitlementId, tier: SubscriptionTierId): boolean {
  const runtime = getRuntimeCatalogItem(runtimeId);
  return Boolean(runtime?.purchasable && runtime.supportedTiers.includes(tier));
}

export function filterPurchasableRuntimeIds(runtimeIds: RuntimeEntitlementId[], tier: SubscriptionTierId): RuntimeEntitlementId[] {
  return runtimeIds.filter((runtimeId, index) => runtimeIds.indexOf(runtimeId) === index && isRuntimePurchasable(runtimeId, tier));
}
