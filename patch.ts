  it('VOICE-GO-004: Build connector restrictions and voice', () => {
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ 
      active: true, 
      tier: 'go', 
      expiresAt: null, 
      buildEntitlement: { active: true, cohortId: '123', includedPc: 1500, purchasedPc: 0 } 
    });
    const ent = entitlementService.getEntitlements();
    expect(ent.models).toContain('paw-voice');
    expect(ent.features).toContain('connectGithub');
    expect(ent.features).toContain('connectVercel');
    expect(ent.features).toContain('connectGoogleWorkspace');
    expect(ent.features).toContain('connectMicrosoft');
    expect(ent.features).not.toContain('connectJira');
    expect(ent.features).not.toContain('connectSlack');
    expect(ent.features).not.toContain('connectLinear');
    expect(ent.features).not.toContain('autonomousTaskBilling');
  });
