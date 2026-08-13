import { afterEach, describe, expect, it } from 'vitest';
import { authService } from './AuthenticationProvider';
import { SUPPORTED_PROVIDERS } from './AuthTypes';

function installLocalStorage(initial: Record<string, string>) {
  const store = { ...initial };
  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
  });
  return store;
}

describe('AuthenticationProvider — account-required foundation', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('does not expose Guest as a supported authentication provider', () => {
    expect(SUPPORTED_PROVIDERS.has('email')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('google')).toBe(true);
    expect(SUPPORTED_PROVIDERS.has('github')).toBe(true);
    expect((SUPPORTED_PROVIDERS as ReadonlySet<string>).has('guest')).toBe(false);
  });

  it('does not restore a historical guest session as an authenticated account', async () => {
    const stored = installLocalStorage({
      'pawos:auth:rememberMe': 'true',
      'pawos:auth:user': JSON.stringify({
        id: 'guest:old',
        name: 'Guest',
        provider: 'guest',
        isGuest: true,
        createdAt: Date.now(),
      }),
    });

    await expect(authService.getCurrentUser()).resolves.toBeNull();
    expect(stored['pawos:auth:user']).toBeUndefined();
  });
});
