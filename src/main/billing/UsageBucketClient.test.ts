import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageBucketClient } from './UsageBucketClient';

const summary = { plan: null, bucketFunded: false, buckets: [], weeklyPacing: null, creditsPcRemaining: 700, limitReached: false, limitReason: null, limitResetsAt: null };
const request = { requestKey: 'req-1', model: 'gemini-3.1-pro-preview', inputTokens: 1234.4, inputIsUpperBound: false, maxOutputTokens: 9000, category: 'chat' };

afterEach(() => vi.useRealTimers());

describe('UsageBucketClient', () => {
  it('reserves with token counts only — never an amount — and returns the granted output tokens', async () => {
    const rpc = vi.fn(async () => ({ ok: true, reservationId: 'res-1', maxOutputTokens: 4096, summary }));
    const client = new UsageBucketClient(rpc as never);
    const result = await client.reserve(request, 'standard');
    expect(result).toEqual({ ok: true, reservationId: 'res-1', maxOutputTokens: 4096 });
    expect(rpc).toHaveBeenCalledWith('reserve_usage', {
      p_request_key: 'req-1', p_model: 'gemini-3.1-pro-preview', p_input_tokens: 1235, p_input_is_upper_bound: false,
      p_max_output_tokens: 9000, p_category: 'chat', p_scope: 'standard', // the server clamps to its settings
    });
    expect(client.getCachedSummary()?.creditsPcRemaining).toBe(700);
  });

  it('fails closed: a reservation that cannot be confirmed refuses the call', async () => {
    const client = new UsageBucketClient((async () => { throw new Error('network down'); }) as never);
    const result = await client.reserve(request, 'standard');
    expect(result).toMatchObject({ ok: false, reason: 'service_unavailable' });
  });

  it('maps a weekly-paced denial to the customer message', async () => {
    const paced = { ...summary, limitReached: true, limitReason: 'plan_weekly_paced', limitResetsAt: '2026-10-08T00:00:00Z' };
    const client = new UsageBucketClient((async () => ({ ok: false, reason: 'plan_weekly_paced', summary: paced })) as never);
    const result = await client.reserve(request, 'standard');
    expect(result).toMatchObject({ ok: false, reason: 'plan_weekly_paced' });
    expect(!result.ok && result.message).toMatch(/^Weekly limit reached/);
  });

  it('settles with provider usage and retries a settlement the server could not receive', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, summary });
    const client = new UsageBucketClient(rpc as never);
    await client.settle('res-1', 'evt-1', { promptTokens: 1000, candidatesTokens: 300, cachedTokens: 0, thoughtsTokens: 200 });
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('settle_usage', {
      p_reservation_id: 'res-1', p_usage_event_id: 'evt-1', p_prompt_tokens: 1000, p_candidates_tokens: 300, p_cached_tokens: 0, p_thoughts_tokens: 200,
    });
  });

  it('releases a reservation whose call produced no usage', async () => {
    const rpc = vi.fn(async () => ({ ok: true, summary }));
    await new UsageBucketClient(rpc as never).release('res-9');
    expect(rpc).toHaveBeenCalledWith('release_usage_reservation', { p_reservation_id: 'res-9' });
  });
});
