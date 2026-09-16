const fs = require('fs');
let code = fs.readFileSync('src/main/billing/SubscriptionStore.runtimeEntitlements.test.ts', 'utf8');

code = code.replace(
  /it\('requires authoritative organization sync before Team or Enterprise becomes effective', async \(\) => \{\n    const \{ subscriptionStore \} = await import\('\.\/SubscriptionStore'\);\n    subscriptionStore\.init\(\);\n\n    subscriptionStore\.reconcileForAccount\('acct-member'\);\n    expect\(subscriptionStore\.getEffective\(\)\.tier\)\.toBe\('go'\);\n\n    subscriptionStore\.syncFromOrganization\('team', 'standard'\);\n    expect\(subscriptionStore\.getEffective\(\)\)\.toMatchObject\(\{ tier: 'team', status: 'active', seatTier: 'standard' \}\);\n\n    subscriptionStore\.syncFromOrganization\('enterprise'\);\n    expect\(subscriptionStore\.getEffective\(\)\)\.toMatchObject\(\{ tier: 'enterprise', status: 'active' \}\);\n  \}\);/,
  \it('requires authoritative organization sync before Team or Enterprise becomes effective', async () => {
    vi.doMock('./OrganizationTierVerification', () => ({
      verifyRealOrganizationTier: vi.fn().mockImplementation(async (token, orgId) => {
        if (orgId === 'org-team') return { ok: true, tier: 'team' };
        if (orgId === 'org-enterprise') return { ok: true, tier: 'enterprise' };
        return { ok: false, reason: 'Invalid org' };
      })
    }));

    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.reconcileForAccount('acct-member');
    expect(subscriptionStore.getEffective().tier).toBe('go');

    await subscriptionStore.syncFromOrganization('fake-token', 'org-team', 'standard');
    expect(subscriptionStore.getEffective()).toMatchObject({ tier: 'team', status: 'active', seatTier: 'standard' });

    await subscriptionStore.syncFromOrganization('fake-token', 'org-enterprise');
    expect(subscriptionStore.getEffective()).toMatchObject({ tier: 'enterprise', status: 'active' });
  });\
);

fs.writeFileSync('src/main/billing/SubscriptionStore.runtimeEntitlements.test.ts', code);
