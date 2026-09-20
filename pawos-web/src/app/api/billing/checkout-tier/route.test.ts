import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/billing/razorpay', () => ({
  getRazorpayCredentials: vi.fn(() => ({ keyId: 'test_key', keySecret: 'test_secret' })),
  razorpayAuthHeader: vi.fn(() => 'Basic auth'),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user_1', email: 'user@example.com' } }, error: null })),
    },
  })),
}));

describe('Checkout Tier Route - Commercial Availability Gate', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:5432');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon_key');
  });

  const makeRequest = async (tier: string, overrides: any = {}) => {
    const req = new Request('http://localhost:3000/api/billing/checkout-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, accessToken: 'fake_token', ...overrides }),
    });
    return POST(req);
  };

  it('rejects Team checkout with "coming soon"', async () => {
    const response = await makeRequest('team', { seatTier: 'standard', seatCount: 2 });
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toMatch(/coming soon/i);
  });

  it('rejects Enterprise checkout with "coming soon"', async () => {
    const response = await makeRequest('enterprise', { seatCount: 20 });
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toMatch(/coming soon/i);
  });

  it('allows Pro checkout', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'order_123' }),
    })) as any;

    const response = await makeRequest('pro');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.orderId).toBe('order_123');
  });
});
