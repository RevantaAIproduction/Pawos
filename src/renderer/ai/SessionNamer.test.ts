import { describe, expect, it } from 'vitest';
import { cleanSessionName } from './SessionNamer';

describe('Session names', () => {
  it('tidies what the model writes', () => {
    expect(cleanSessionName('"PawOS build warnings."')).toBe('PawOS build warnings');
    expect(cleanSessionName('  OAuth parity\nweb/desktop  ')).toBe('OAuth parity web/desktop');
    expect(cleanSessionName('   ')).toBeNull();
    expect(cleanSessionName('x'.repeat(80))).toHaveLength(60);
  });
});
