import { describe, expect, it, vi } from 'vitest';
import { requestSignupCode } from './signupCode';

const input = { email: 'new@example.com', firstName: 'Ada', lastName: 'Lovelace' };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('requestSignupCode', () => {
  it('asks the server for a code and never sends one of its own', async () => {
    const fetchImpl = reply(200, { ok: true, verifyType: 'signup' });
    const result = await requestSignupCode(input, fetchImpl);

    expect(result).toEqual({ verifyType: 'signup' });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://pawos.revantaai.com/api/auth/signup/code');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ email: 'new@example.com', firstName: 'Ada', lastName: 'Lovelace' });
    expect(body).not.toHaveProperty('code');
  });

  it('passes on the check type for an unfinished sign-up', async () => {
    expect(await requestSignupCode(input, reply(200, { ok: true, verifyType: 'email' }))).toEqual({ verifyType: 'email' });
  });

  it("shows the server's message when the address already has an account", async () => {
    await expect(requestSignupCode(input, reply(409, { ok: false, code: 'account_exists', error: 'An account with this email already exists. Log in instead.' }))).rejects.toThrow(
      'An account with this email already exists. Log in instead.'
    );
  });

  it('reports a rate limit and an unreachable server', async () => {
    await expect(requestSignupCode(input, reply(429, { ok: false, error: 'Too many codes requested. Wait a few minutes and try again.' }))).rejects.toThrow('Too many codes requested');
    const offline = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    await expect(requestSignupCode(input, offline)).rejects.toThrow("Couldn't reach PawOS");
  });
});
