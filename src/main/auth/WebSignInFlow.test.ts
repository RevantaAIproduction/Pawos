import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const opened: string[] = [];
vi.mock('electron', () => ({ shell: { openExternal: async (url: string) => void opened.push(url) } }));

import { handleOAuthProtocolUrl } from './OAuthProtocolBridge';
import { cancelWebSignIn, createVerifier, startWebSignIn } from './WebSignInFlow';

describe('Continue with browser', () => {
  beforeEach(() => {
    opened.length = 0;
  });

  it('the challenge is the SHA-256 of a verifier that never leaves the app', () => {
    const { verifier, challenge } = createVerifier();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('opens PawOS Web with only the challenge, then trades the returned code and the verifier for the token', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { code: string; verifier: string };
      const challenge = new URL(opened[0]).searchParams.get('challenge');
      expect(createHash('sha256').update(body.verifier).digest('base64url')).toBe(challenge);
      expect(body.code).toBe('one-time-code');
      return new Response(JSON.stringify({ ok: true, tokenHash: 'th', email: 'a@example.com' }), { status: 200 });
    });
    const result = startWebSignIn(fetchImpl as unknown as typeof fetch);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toMatch(/^https:\/\/pawos\.revantaai\.com\/auth\/desktop\?challenge=[A-Za-z0-9_-]{43}$/);
    await handleOAuthProtocolUrl('pawos://web-auth-callback?code=one-time-code');
    await expect(result).resolves.toEqual({ tokenHash: 'th', email: 'a@example.com' });
    expect(fetchImpl).toHaveBeenCalledWith('https://pawos.revantaai.com/api/auth/desktop/consume', expect.objectContaining({ method: 'POST' }));
  });

  it('Cancel stops waiting', async () => {
    const result = startWebSignIn(vi.fn() as unknown as typeof fetch);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    cancelWebSignIn();
    await expect(result).rejects.toThrow('cancelled');
  });

  it('an expired code is reported, not a session', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, message: 'This sign-in has expired. Try again from PawOS Desktop.' }), { status: 400 }));
    const result = startWebSignIn(fetchImpl as unknown as typeof fetch);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    await handleOAuthProtocolUrl('pawos://web-auth-callback?code=old');
    await expect(result).rejects.toThrow('expired');
  });
});
