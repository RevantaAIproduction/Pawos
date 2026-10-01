import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanupLegacyBillingFiles, RETIRED_BILLING_FILES } from './LegacyBillingCleanup';

const KEPT = ['credits.json', 'usage-events.json', 'subscription.json', 'pricing.json', 'ticketPricing.json', 'usage.json', path.join('usage', 'fb3a04dd-4c58-4d77-b213-b62e030bf6ea.json')];

function profile(): string {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-legacy-cleanup-'));
  fs.mkdirSync(path.join(userData, 'billing', 'usage'), { recursive: true });
  for (const file of [...RETIRED_BILLING_FILES, ...KEPT]) fs.writeFileSync(path.join(userData, 'billing', file), '{}');
  fs.writeFileSync(path.join(userData, 'conversation-sessions.json'), '[]');
  return userData;
}

describe('cleanupLegacyBillingFiles', () => {
  it('removes exactly the retired billing files and nothing else', () => {
    const userData = profile();
    const removed = cleanupLegacyBillingFiles(userData);
    expect(removed.map((p) => path.relative(path.join(userData, 'billing'), p)).sort()).toEqual([...RETIRED_BILLING_FILES].sort());
    for (const file of RETIRED_BILLING_FILES) expect(fs.existsSync(path.join(userData, 'billing', file))).toBe(false);
    for (const file of KEPT) expect(fs.existsSync(path.join(userData, 'billing', file))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'billing'))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'billing', 'usage'))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'conversation-sessions.json'))).toBe(true);
  });

  it('is idempotent — a second run (or a profile without the files) removes nothing', () => {
    const userData = profile();
    cleanupLegacyBillingFiles(userData);
    expect(cleanupLegacyBillingFiles(userData)).toEqual([]);
    expect(cleanupLegacyBillingFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-empty-')))).toEqual([]);
  });

  it('never removes a directory that happens to have a retired name', () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-legacy-dir-'));
    fs.mkdirSync(path.join(userData, 'billing', 'paw-compute-config.json'), { recursive: true });
    expect(cleanupLegacyBillingFiles(userData)).toEqual([]);
    expect(fs.statSync(path.join(userData, 'billing', 'paw-compute-config.json')).isDirectory()).toBe(true);
  });
});
