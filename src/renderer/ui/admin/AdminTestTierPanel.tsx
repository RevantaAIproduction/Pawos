/**
 * Internal Admin/Test Tier Switcher
 *
 * INTERNAL TESTING ONLY
 *
 * Allows authorized internal accounts to test different tiers without
 * modifying real billing records.
 *
 * Authorized accounts:
 * - tharun@revantaai.com
 * - founder@revantaai.com
 * - pawos@revantaai.com
 */

import React, { useState, useEffect } from 'react';
import { getIpcBridge } from '../../services/ipc/ipcBridge';
import { getSupabaseClient } from '../../auth/supabaseClient';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';

const AVAILABLE_TIERS: SubscriptionTierId[] = ['go', 'pro', 'proMax', 'team', 'enterprise'];
const AUTHORIZED_ADMINS = new Set([
  'tharun@revantaai.com',
  'founder@revantaai.com',
  'pawos@revantaai.com',
]);

interface TestTierState {
  realTier: SubscriptionTierId | null;
  testTier: SubscriptionTierId | null;
  appliedAt: number | null;
  loading: boolean;
  error: string | null;
}

export function AdminTestTierPanel() {
  const [state, setState] = useState<TestTierState>({
    realTier: null,
    testTier: null,
    appliedAt: null,
    loading: true,
    error: null,
  });

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTierId>('pro');

  useEffect(() => {
    const initializePanel = async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          setState((prev) => ({ ...prev, error: 'Not authenticated', loading: false }));
          return;
        }

        const email = userData.user.email || '';
        const id = userData.user.id;
        const authorized = AUTHORIZED_ADMINS.has(email.toLowerCase());

        setUserEmail(email);
        setUserId(id);
        setIsAuthorized(authorized);

        if (!authorized) {
          setState((prev) => ({ ...prev, loading: false }));
          return;
        }

        // 1. Load from database (persisted override)
        const { data: dbOverride, error: dbError } = await supabase
          .from('admin_test_tier_overrides')
          .select('*')
          .eq('user_id', id)
          .eq('organization_id', null)
          .single();

        if (dbError && dbError.code !== 'PGRST116') {
          // PGRST116 means no rows found, which is fine
          console.warn('Failed to load override from database:', dbError);
        }

        // 2. If found in database, hydrate the override store via IPC
        if (dbOverride) {
          await getIpcBridge().adminHydrateTestTier({
            userId: id,
            realTier: dbOverride.real_tier,
            testTier: dbOverride.override_tier,
          });

          setState((prev) => ({
            ...prev,
            realTier: dbOverride.real_tier,
            testTier: dbOverride.override_tier,
            appliedAt: new Date(dbOverride.updated_at).getTime(),
            loading: false,
          }));
        } else {
          // No override in database, check in-memory (for this session only)
          const result = await getIpcBridge().adminGetTestTier(id, email);

          if (result.ok) {
            setState((prev) => ({
              ...prev,
              realTier: result.override?.realTier || null,
              testTier: result.override?.testTier || null,
              appliedAt: result.override?.appliedAt || null,
              loading: false,
            }));
          } else {
            setState((prev) => ({ ...prev, error: result.reason || 'Failed to load tier', loading: false }));
          }
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Error initializing panel',
          loading: false,
        }));
      }
    };

    initializePanel();
  }, []);

  const handleApplyTier = async () => {
    if (!userEmail || !userId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const supabase = await getSupabaseClient();

      // 1. Apply override via IPC (updates in-memory store in main process)
      const result = await getIpcBridge().adminApplyTestTier({
        tier: selectedTier,
        userEmail,
        userId,
      });

      if (!result.ok) {
        setState((prev) => ({
          ...prev,
          error: result.reason || 'Failed to apply tier',
          loading: false,
        }));
        return;
      }

      // 2. Persist to database (for restart persistence)
      const { error: dbError } = await supabase
        .from('admin_test_tier_overrides')
        .upsert(
          {
            user_id: userId,
            organization_id: null, // Personal tier override
            real_tier: result.override?.realTier || 'go',
            override_tier: selectedTier,
            applied_by: userEmail,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,organization_id' }
        );

      if (dbError) {
        console.error('Failed to persist override to database:', dbError);
        // Continue anyway - in-memory override is still active this session
      }

      // 3. Log to audit trail
      await supabase.from('admin_test_tier_audit').insert({
        user_id: userId,
        organization_id: null,
        administrator_id: userId,
        administrator_email: userEmail,
        action: 'apply',
        previous_tier: state.realTier,
        new_tier: selectedTier,
      });

      setState((prev) => ({
        ...prev,
        realTier: result.override?.realTier || null,
        testTier: result.override?.testTier || null,
        appliedAt: result.override?.appliedAt || null,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error applying tier',
        loading: false,
      }));
    }
  };

  const handleClearOverride = async () => {
    if (!userEmail || !userId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const supabase = await getSupabaseClient();

      // 1. Clear override via IPC (clears in-memory store in main process)
      const result = await getIpcBridge().adminClearTestTier({
        userId,
        userEmail,
      });

      if (!result.ok) {
        setState((prev) => ({
          ...prev,
          error: result.reason || 'Failed to clear override',
          loading: false,
        }));
        return;
      }

      // 2. Delete from database
      const { error: dbError } = await supabase
        .from('admin_test_tier_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('organization_id', null); // Personal override only

      if (dbError) {
        console.error('Failed to clear override from database:', dbError);
        // Continue anyway - in-memory clear is still active
      }

      // 3. Log to audit trail
      await supabase.from('admin_test_tier_audit').insert({
        user_id: userId,
        organization_id: null,
        administrator_id: userId,
        administrator_email: userEmail,
        action: 'clear',
        previous_tier: state.testTier,
        new_tier: null,
      });

      setState((prev) => ({
        ...prev,
        testTier: null,
        appliedAt: null,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error clearing override',
        loading: false,
      }));
    }
  };

  if (state.loading) {
    return <div style={{ padding: '16px', color: '#666' }}>Loading...</div>;
  }

  // Only show panel to authorized admins
  if (!isAuthorized) {
    return null;
  }

  const isOverrideActive = state.testTier !== null;

  return (
    <div
      style={{
        padding: '16px',
        border: '2px solid #ff6b6b',
        borderRadius: '8px',
        backgroundColor: '#fff5f5',
        marginBottom: '20px',
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#c92a2a' }}>
          ⚙️ INTERNAL ADMIN / TEST
        </h3>
        <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666' }}>
          Internal testing only. This does not represent a real purchase.
        </p>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '14px',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>Account:</strong> {userEmail}
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>Real Tier:</strong> {state.realTier ? state.realTier.toUpperCase() : 'Unknown'}
        </div>

        <div>
          <strong>Test Override:</strong>{' '}
          {isOverrideActive ? (
            <span style={{ color: '#2f9e44', fontWeight: 'bold' }}>
              {state.testTier?.toUpperCase()} (active since {new Date(state.appliedAt || 0).toLocaleTimeString()})
            </span>
          ) : (
            <span style={{ color: '#999' }}>None</span>
          )}
        </div>
      </div>

      {state.error && (
        <div
          style={{
            padding: '8px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            marginBottom: '12px',
            color: '#c00',
            fontSize: '12px',
          }}
        >
          {state.error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value as SubscriptionTierId)}
          disabled={state.loading}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            fontSize: '14px',
          }}
        >
          {AVAILABLE_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier.toUpperCase()}
            </option>
          ))}
        </select>

        <button
          onClick={handleApplyTier}
          disabled={state.loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2f9e44',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: state.loading ? 'wait' : 'pointer',
            opacity: state.loading ? 0.6 : 1,
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {state.loading ? 'Applying...' : 'Apply Test Tier'}
        </button>

        {isOverrideActive && (
          <button
            onClick={handleClearOverride}
            disabled={state.loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: state.loading ? 'wait' : 'pointer',
              opacity: state.loading ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {state.loading ? 'Clearing...' : 'Clear Override'}
          </button>
        )}
      </div>

      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
        ℹ️ Test tier changes persist across app restart.
        <br />
        Authorized accounts only. Server-side verification enforced.
      </p>
    </div>
  );
}
