import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({ rpc, from: () => query }),
}));

import { getGivablePawCompute, givePawCompute, listPawComputeGifts } from './orgPawCompute';

beforeEach(() => {
  rpc.mockReset();
  for (const fn of Object.values(query)) fn.mockReset().mockReturnValue(query);
});

describe('giving Paw Compute (Desktop client)', () => {
  it('asks the database what can be given', async () => {
    rpc.mockResolvedValue({ data: 1500, error: null });
    await expect(getGivablePawCompute()).resolves.toBe(1500);
    expect(rpc).toHaveBeenCalledWith('get_my_givable_paw_compute');
  });

  it('gives through give_paw_compute and shows the database’s own message when refused', async () => {
    rpc.mockResolvedValueOnce({ data: { gift_id: 'g', pc: 500, givable_left: 1000 }, error: null });
    await expect(givePawCompute('org', 'member', 500, '  For the release  ')).resolves.toEqual({ givableLeft: 1000 });
    expect(rpc).toHaveBeenCalledWith('give_paw_compute', { p_organization_id: 'org', p_member_user_id: 'member', p_pc: 500, p_note: 'For the release' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'You have 1000 Paw Compute left to give. Buy more Paw Compute first.' } });
    await expect(givePawCompute('org', 'member', 2000)).rejects.toThrow('You have 1000 Paw Compute left to give');
  });

  it('lists the organization’s gifts, newest first', async () => {
    query.limit.mockResolvedValue({ data: [{ id: 'g1', organization_id: 'org', given_by: 'a', given_to: 'm', pc: 500, note: null, created_at: '2026-10-05T00:00:00Z' }], error: null });
    await expect(listPawComputeGifts('org')).resolves.toEqual([{ id: 'g1', organizationId: 'org', givenBy: 'a', givenTo: 'm', pc: 500, note: null, createdAt: '2026-10-05T00:00:00Z' }]);
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
