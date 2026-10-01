import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';

describe('Paw Go: smaller allowance, real per-turn cost', () => {
  it('Go gets 500 PC per cycle — the limit itself is smaller', () => {
    expect(pawComputeCapacityStore.resolve('go')).toMatchObject({ window5hPc: 500, windowWeeklyPc: 500 });
  });

  it('no tier multiplies what a turn is charged (the old Go x2 inflated history and double-billed purchased PC)', () => {
    const ipc = fs.readFileSync(path.join(__dirname, '../ipc/ipc.ts'), 'utf8');
    expect(ipc).not.toMatch(/customerPc\s*=\s*customerPc\s*\*\s*2/);
    expect(ipc).toContain('const customerPc = normalizedComputeToCustomerPc(aggregated.newNormalizedCompute);');
  });
});
