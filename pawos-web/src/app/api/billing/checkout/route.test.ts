import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/billing/razorpay', () => ({
  getRazorpayCredentials: vi.fn(() => ({ keyId: 'test_key', keySecret: 'test_secret' })),
  getRazorpayPlanId: vi.fn(() => 'plan_123'),
  razorpayAuthHeader: vi.fn(() => 'Basic auth'),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user_1', email: 'user@example.com' } }, error: null })),
    },
  })),
}));

describe('Checkout Route - Commercial Availability Gate', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:5432');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon_key');
  });

  const makeRequest = async (plan: string, overrides: any = {}) => {
    const req = new Request('http://localhost:3000/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, accessToken: 'fake_token', ...overrides }),
    });
    return POST(req);
  };

  it('rejects Team Standard checkout with "coming soon"', async () => {
    const response = await makeRequest('team', { seatTier: 'standard', seatCount: 2 });
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toMatch(/coming soon/i);
  });

  it('rejects Team Premium checkout with "coming soon"', async () => {
    const response = await makeRequest('team', { seatTier: 'premium', seatCount: 2 });
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

  it('allows Pro checkout (does not block commercially)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'sub_123' }),
    })) as any;

    const response = await makeRequest('pro');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.subscriptionId).toBe('sub_123');
  });

  it('allows Pro Max checkout (does not block commercially)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'sub_123' }),
    })) as any;

    const response = await makeRequest('proMax', { proMaxVariant: '5x' });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.subscriptionId).toBe('sub_123');
  });
});
