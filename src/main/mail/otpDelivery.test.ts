import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('./EmailService', () => ({ emailService: { isConfigured: () => false, sendOTP: vi.fn() } }));

import { deliverOtp } from './otpDelivery';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('deliverOtp (installed/Store builds have no SMTP credentials)', () => {
  it('without local SMTP, asks pawos-web to send the code — never needs SMTP_* in the app', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    await deliverOtp('user@example.com', { code: '123456', expiresInMinutes: 5, purpose: 'signup' }, { fetchImpl: fetchImpl as unknown as typeof fetch, hasLocalSmtp: () => false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://pawos.revantaai.com/api/auth/send-verification-code');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'user@example.com', code: '123456', expiresInMinutes: 5, purpose: 'signup' });
  });

  it('surfaces the server message (e.g. rate limit) instead of an SMTP/.env error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { ok: false, error: 'Too many codes requested. Wait a few minutes and try again.' }));
    await expect(
      deliverOtp('user@example.com', { code: '123456', expiresInMinutes: 5, purpose: 'password-reset' }, { fetchImpl: fetchImpl as unknown as typeof fetch, hasLocalSmtp: () => false })
    ).rejects.toThrow('Too many codes requested');
  });

  it('reports a network failure in plain words', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(
      deliverOtp('user@example.com', { code: '123456', expiresInMinutes: 5, purpose: 'signup' }, { fetchImpl: fetchImpl as unknown as typeof fetch, hasLocalSmtp: () => false })
    ).rejects.toThrow("Couldn't reach PawOS");
  });

  it('the password-reset IPC handler uses deliverOtp, sign-up codes come from the server, and the web route exists', () => {
    const ipc = fs.readFileSync(path.join(__dirname, '../ipc/ipc.ts'), 'utf8');
    // Sign-up: the server makes and checks the code (signupCode.ts) — this app never sends its own.
    expect(ipc).toContain('requestSignupCode(');
    expect(ipc).not.toContain("purpose: 'signup'");
    expect(ipc).not.toContain("'auth:verifyOtp'");
    expect(ipc).toContain("deliverOtp(email, { code, expiresInMinutes, purpose: 'password-reset' })");
    expect(ipc).not.toContain('emailService.sendOTP');
    const route = path.join(__dirname, '../../../pawos-web/src/app/api/auth/send-verification-code/route.ts');
    expect(fs.readFileSync(route, 'utf8')).toMatch(/\^\\d\{6\}\$/);
  });
});
