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

  it.each([
    ['pro', {}],
    ['pro', { options: { proBillingFrequency: 'yearly' } }],
    ['proMax', { options: { proMaxVariant: '5x' } }],
    ['proMax', { options: { proMaxVariant: '20x' } }],
  ])('refuses a one-time order for %s — plans are subscriptions (never charges without activating)', async (tier, overrides) => {
    global.fetch = vi.fn() as any;
    const response = await makeRequest(tier, overrides);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toMatch(/subscriptions/i);
    expect(global.fetch).not.toHaveBeenCalled(); // no Razorpay order is ever created
  });
});
