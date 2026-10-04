import { STORE_PACKAGE_FAMILY_NAME } from './storeRuntime';

/**
 * Microsoft Store (MSIX) update detection.
 *
 * Installing a Store update from inside PawOS needs the Windows.Services.Store API called WITH the
 * package identity. Electron can't call WinRT, and processes PawOS launches don't carry the identity
 * (see storeStartupTask.ts), so PawOS can't install Store updates itself. What it can do:
 *  - find out whether the Store has a newer PawOS than the one running, from the Store's public
 *    product catalog (no account, no identity needed), and tell the user;
 *  - open PawOS's OWN product page in the Store's small pop-up window, where the Update button is —
 *    not the Store's "Downloads and updates" library.
 */

/** Partner Center > Product identity > Store ID. */
export const STORE_PRODUCT_ID = '9P6732L7486C';

/** PawOS's product page in the Store's compact pop-up window (it shows Update when one is available). */
export const STORE_PRODUCT_URI = `ms-windows-store://pdp/?ProductId=${STORE_PRODUCT_ID}&mode=mini`;

/** The Store's public product catalog entry for PawOS. */
export const STORE_CATALOG_URL = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${STORE_PRODUCT_ID}&market=US&languages=en-US`;

const PACKAGE_NAME = STORE_PACKAGE_FAMILY_NAME.split('_')[0] ?? 'PawosAI.PawOS';

/** Numeric comparison of dotted versions ("1.0.2" vs "1.0.2.0" are equal). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 4); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * The highest PawOS package version in a catalog response, from the package full names it lists
 * ("PawosAI.PawOS_1.0.2.0_x64__y5w6824kw3wcj"). Reads only PawOS's own package name, wherever it
 * appears in the response, so a change in the catalog's layout doesn't produce a wrong version.
 */
export function latestVersionInCatalog(body: string): string | null {
  const pattern = new RegExp(`${PACKAGE_NAME.replace(/\./g, '\\.')}_(\\d+\\.\\d+\\.\\d+\\.\\d+)_`, 'g');
  let latest: string | null = null;
  for (const match of body.matchAll(pattern)) {
    const version = match[1];
    if (version && (latest === null || compareVersions(version, latest) > 0)) latest = version;
  }
  return latest;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; text(): Promise<string> }>;

/** The newest PawOS version published in the Store, or null when it can't be told (offline, catalog changed). */
export async function fetchLatestStoreVersion(fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = 15_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(STORE_CATALOG_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return latestVersionInCatalog(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
