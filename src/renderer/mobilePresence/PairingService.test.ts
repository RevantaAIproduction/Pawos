import { describe, expect, it, vi } from 'vitest';

const { rpcMock, entitlementGetSnapshotMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  entitlementGetSnapshotMock: vi.fn(),
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({ rpc: rpcMock }),
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: { entitlementGetSnapshot: entitlementGetSnapshotMock },
}));

import { pairingService } from './PairingService';

function makeRpcResult(result: { data: unknown; error: unknown }) {
  return {
    single: () => Promise.resolve(result),
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve(result),
  };
}

describe('pairingService', () => {
  it('beginPairing() builds a real pairing URL and QR data URL from the RPC response', async () => {
    rpcMock.mockReturnValueOnce(
      makeRpcResult({
        data: { session_id: 'session-1', token: 'tok-abc', expires_at: '2026-01-01T00:05:00Z' },
        error: null,
      })
    );

    const result = await pairingService.beginPairing();

    expect(rpcMock).toHaveBeenCalledWith('begin_pairing_session', {});
    expect(result.sessionId).toBe('session-1');
    expect(result.token).toBe('tok-abc');
    expect(result.pairingUrl).toBe('https://pawos.app/pair/session-1?token=tok-abc');
    expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.expiresAt).toBe('2026-01-01T00:05:00Z');
  });

  it('beginPairing() lets a Go-tier rejection from the RPC propagate untouched', async () => {
    rpcMock.mockReturnValueOnce(
      makeRpcResult({ data: null, error: { message: 'Mobile pairing requires Paw Pro or higher.' } })
    );

    await expect(pairingService.beginPairing()).rejects.toEqual({
      message: 'Mobile pairing requires Paw Pro or higher.',
    });
  });

  it('cancelPairing() calls cancel_pairing_session with the session id', async () => {
    rpcMock.mockReturnValueOnce(makeRpcResult({ data: null, error: null }));

    await pairingService.cancelPairing('session-1');

    expect(rpcMock).toHaveBeenCalledWith('cancel_pairing_session', { p_session_id: 'session-1' });
  });

  it('cancelPairing() surfaces an RPC error', async () => {
    rpcMock.mockReturnValueOnce(makeRpcResult({ data: null, error: { message: 'not found' } }));
    await expect(pairingService.cancelPairing('session-1')).rejects.toEqual({ message: 'not found' });
  });

  it('syncEntitlementTier() self-reports the real local tier snapshot into sync_my_entitlement_tier', async () => {
    entitlementGetSnapshotMock.mockResolvedValueOnce({ tier: 'pro' });
    rpcMock.mockReturnValueOnce(makeRpcResult({ data: null, error: null }));

    await pairingService.syncEntitlementTier();

    expect(rpcMock).toHaveBeenCalledWith('sync_my_entitlement_tier', { p_tier: 'pro' });
  });

  it('syncEntitlementTier() surfaces an RPC error rather than pretending the sync succeeded', async () => {
    entitlementGetSnapshotMock.mockResolvedValueOnce({ tier: 'go' });
    rpcMock.mockReturnValueOnce(makeRpcResult({ data: null, error: { message: 'not authorized' } }));
    await expect(pairingService.syncEntitlementTier()).rejects.toEqual({ message: 'not authorized' });
  });
});
