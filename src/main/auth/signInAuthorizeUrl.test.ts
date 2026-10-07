import { describe, expect, it } from 'vitest';
import { isSignInAuthorizeUrl } from './signInAuthorizeUrl';

const SUPABASE = 'https://project-ref.supabase.co';

describe('isSignInAuthorizeUrl', () => {
  it("accepts the account service's authorize URL with its parameters", () => {
    expect(isSignInAuthorizeUrl(`${SUPABASE}/auth/v1/authorize?provider=github&redirect_to=https%3A%2F%2Fpawos.revantaai.com%2Fauth%2Fgithub%2Fcallback&code_challenge=abc&code_challenge_method=s256`, SUPABASE)).toBe(true);
    expect(isSignInAuthorizeUrl(`${SUPABASE}/auth/v1/authorize?provider=google&prompt=select_account`, `${SUPABASE}/`)).toBe(true);
  });

  it('refuses any other site, path or scheme', () => {
    for (const candidate of [
      'https://evil.example/auth/v1/authorize?provider=github',
      'https://project-ref.supabase.co.evil.example/auth/v1/authorize',
      'https://user:pass@project-ref.supabase.co/auth/v1/authorize',
      `${SUPABASE}/auth/v1/logout`,
      `${SUPABASE}/auth/v1/authorize/../../storage`,
      'http://project-ref.supabase.co/auth/v1/authorize',
      'file:///C:/Windows/System32/calc.exe',
      'ms-settings:privacy',
      'pawos://jump/new-chat',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(isSignInAuthorizeUrl(candidate, SUPABASE), candidate).toBe(false);
    }
  });

  it('refuses non-strings and a missing configuration', () => {
    expect(isSignInAuthorizeUrl(undefined, SUPABASE)).toBe(false);
    expect(isSignInAuthorizeUrl({ href: `${SUPABASE}/auth/v1/authorize` }, SUPABASE)).toBe(false);
    expect(isSignInAuthorizeUrl(`${SUPABASE}/auth/v1/authorize`, undefined)).toBe(false);
  });
});
