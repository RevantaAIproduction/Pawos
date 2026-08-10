import { describe, expect, it } from 'vitest';
import { getExhaustionPrimaryActions } from './CreditsRequiredNotice';

describe('getExhaustionPrimaryActions — exactly two (or fewer) tier-determined actions', () => {
  it('Go: Upgrade to Pro, Buy Paw Compute', () => {
    const actions = getExhaustionPrimaryActions('go', undefined, false, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['upgrade', 'buyCompute']);
    expect(actions[0]!.label).toBe('Upgrade to Pro');
    expect(actions[1]!.label).toBe('Buy Paw Compute');
  });

  it('Pro: Upgrade to Pro Max, Buy Paw Compute', () => {
    const actions = getExhaustionPrimaryActions('pro', undefined, false, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['upgrade', 'buyCompute']);
    expect(actions[0]!.label).toBe('Upgrade to Pro Max');
  });

  it('Pro Max: Buy Paw Compute, Contact Sales — when Enterprise contact is available', () => {
    const actions = getExhaustionPrimaryActions('proMax', undefined, false, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['buyCompute', 'contactSales']);
    expect(actions.some((a) => a.id === 'upgrade')).toBe(false);
  });

  it('Pro Max: only Buy Paw Compute — when Enterprise contact is not available (never padded to two)', () => {
    const actions = getExhaustionPrimaryActions('proMax', undefined, false, false);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.id).toBe('buyCompute');
  });

  it('Team Standard seat: Upgrade to Team Premium, Buy Paw Compute', () => {
    const actions = getExhaustionPrimaryActions('team', 'standard', false, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['upgrade', 'buyCompute']);
    expect(actions[0]!.label).toBe('Upgrade to Team Premium');
  });

  it('Team Premium seat: Upgrade to Enterprise, Buy Paw Compute', () => {
    const actions = getExhaustionPrimaryActions('team', 'premium', false, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['upgrade', 'buyCompute']);
    expect(actions[0]!.label).toBe('Upgrade to Enterprise');
  });

  it('Enterprise (pooled): Contact Organization Administrator, Request Additional Organization Paw Compute — no upgrade, no personal purchase', () => {
    const actions = getExhaustionPrimaryActions('enterprise', undefined, true, true);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.id)).toEqual(['contactAdmin', 'requestMoreCompute']);
    expect(actions.some((a) => a.id === 'upgrade' || a.id === 'buyCompute')).toBe(false);
  });

  it('pooled always wins regardless of tier field (Enterprise accounts are always reported as tier "enterprise", but this guards the contract)', () => {
    const actions = getExhaustionPrimaryActions('pro', undefined, true, true);
    expect(actions.map((a) => a.id)).toEqual(['contactAdmin', 'requestMoreCompute']);
  });

  it('never returns more than two actions for any real combination', () => {
    const tiers: Array<Parameters<typeof getExhaustionPrimaryActions>[0]> = ['go', 'pro', 'proMax', 'team', 'enterprise'];
    const seatTiers: Array<'standard' | 'premium' | undefined> = ['standard', 'premium', undefined];
    for (const tier of tiers) {
      for (const seatTier of seatTiers) {
        for (const pooled of [true, false]) {
          for (const enterpriseContactAvailable of [true, false]) {
            const actions = getExhaustionPrimaryActions(tier, seatTier, pooled, enterpriseContactAvailable);
            expect(actions.length).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it('never suggests a downgrade or lateral action for any tier', () => {
    const downgradeIds = new Set(['downgrade', 'lateral']);
    const tiers: Array<Parameters<typeof getExhaustionPrimaryActions>[0]> = ['go', 'pro', 'proMax', 'team', 'enterprise'];
    for (const tier of tiers) {
      const actions = getExhaustionPrimaryActions(tier, 'standard', tier === 'enterprise', true);
      for (const action of actions) {
        expect(downgradeIds.has(action.id)).toBe(false);
      }
    }
  });
});
