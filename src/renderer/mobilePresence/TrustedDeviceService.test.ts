import { describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({ from: fromMock, rpc: rpcMock }),
}));

import { trustedDeviceService } from './TrustedDeviceService';

function makeSelectChain(returns: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    returns: vi.fn(() => Promise.resolve(returns)),
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve(returns),
  };
  return chain;
}

describe('trustedDeviceService', () => {
  it('list() maps snake_case rows to TrustedDevice, filling in default capabilities for a null column', async () => {
    const row = {
      id: 'device-1',
      user_id: 'user-1',
      name: 'My Phone',
      device_type: 'pwa',
      platform: 'iOS',
      browser: 'Safari',
      capabilities: { pushNotifications: true },
      status: 'active',
      paired_at: '2026-01-01T00:00:00Z',
      last_seen_at: '2026-01-02T00:00:00Z',
      revoked_at: null,
    };
    fromMock.mockReturnValueOnce(makeSelectChain({ data: [row], error: null }));

    const devices = await trustedDeviceService.list();

    expect(fromMock).toHaveBeenCalledWith('trusted_devices');
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: 'device-1', name: 'My Phone', deviceType: 'pwa' });
    // Real merge with defaults — a device that never declared 'voice' capability doesn't silently become `undefined`.
    expect(devices[0]?.capabilities).toEqual({
      pushNotifications: true,
      voice: false,
      camera: false,
      microphone: false,
      biometrics: false,
      offlineSupport: false,
      backgroundSync: false,
    });
  });

  it('list() throws the real Supabase error rather than swallowing it', async () => {
    fromMock.mockReturnValueOnce(makeSelectChain({ data: null, error: { message: 'RLS denied' } }));
    await expect(trustedDeviceService.list()).rejects.toEqual({ message: 'RLS denied' });
  });

  it('rename() issues a plain update scoped by id, no RPC involved', async () => {
    const chain = makeSelectChain({ data: null, error: null });
    fromMock.mockReturnValueOnce(chain);

    await trustedDeviceService.rename('device-1', 'New Name');

    expect(fromMock).toHaveBeenCalledWith('trusted_devices');
    expect(chain.update).toHaveBeenCalledWith({ name: 'New Name' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'device-1');
  });

  it('revoke() calls the revoke_trusted_device RPC, not a plain table update', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await trustedDeviceService.revoke('device-1');

    expect(rpcMock).toHaveBeenCalledWith('revoke_trusted_device', { p_device_id: 'device-1' });
  });

  it('revoke() surfaces an RPC error rather than pretending the device was revoked', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not authorized' } });
    await expect(trustedDeviceService.revoke('device-1')).rejects.toEqual({ message: 'not authorized' });
  });
});
