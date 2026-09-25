import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authStartGithubSignIn: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  billingReconcileForAccount: vi.fn(async () => ({})),
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: {
    authStartGithubSignIn: mocks.authStartGithubSignIn,
    authIsGithubSignInConfigured: vi.fn(async () => true),
    envGetApiKeys: vi.fn(async () => ({ githubRedirectUri: 'https://pawos.revantaai.com/auth/github/callback' })),
    billingReconcileForAccount: mocks.billingReconcileForAccount,
    billingClearBuildAccess: vi.fn(async () => {}),
    billingSyncBuildAccess: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('./supabaseClient', () => ({
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getSession: mocks.getSession,
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
  })),
}));

const store = new Map<string, string>();
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

import { GoogleAuthProvider } from './providers/GoogleAuthProvider';
import { AuthenticationProvider } from './AuthenticationProvider';

const SERVER_ID = '446eeaeb-585d-4f9a-a1dc-baa95ce54326';
const profile = { sub: '118026972990124466573', name: 'Tharun Esta', email: 'tharun.esta@gmail.com', picture: 'p.png' };

describe('One account id for every sign-in method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: 'https://x.supabase.co/auth/v1/authorize?provider=google' }, error: null });
    mocks.authStartGithubSignIn.mockResolvedValue({ code: 'supabase-code' });
  });

  it('Google sign-in runs through Supabase OAuth and returns the PawOS server account id', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: SERVER_ID, email: profile.email, user_metadata: { full_name: 'Tharun Esta', avatar_url: 'p.png' } } },
      error: null,
    });
    const user = await new GoogleAuthProvider().signIn();
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('supabase-code');
    expect(user).toMatchObject({ id: SERVER_ID, email: 'tharun.esta@gmail.com', name: 'Tharun Esta', provider: 'google' });
  });

  it('never produces a local-only "google:…" id — a failed exchange is an error', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: 'invalid flow state' } });
    await expect(new GoogleAuthProvider().signIn()).rejects.toThrow(/invalid flow state/);
  });

  it('a saved local-only sign-in with no server session is dropped at startup (sign in again → real account)', async () => {
    store.set('pawos:auth:user', JSON.stringify({ id: `google:${profile.sub}`, name: 'Tharun Esta', email: profile.email, provider: 'google', isGuest: false, createdAt: 1 }));
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const user = await new AuthenticationProvider().getCurrentUser();
    expect(user).toBeNull();
    expect(store.has('pawos:auth:user')).toBe(false);
  });

  it('a saved sign-in always takes its id from the server session', async () => {
    store.set('pawos:auth:user', JSON.stringify({ id: `google:${profile.sub}`, name: 'Tharun Esta', email: profile.email, provider: 'google', isGuest: false, createdAt: 1 }));
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: SERVER_ID, email: profile.email } } } });
    const user = await new AuthenticationProvider().getCurrentUser();
    expect(user?.id).toBe(SERVER_ID);
    expect(JSON.parse(store.get('pawos:auth:user') ?? '{}').id).toBe(SERVER_ID);
    expect(mocks.billingReconcileForAccount).toHaveBeenCalledWith(SERVER_ID);
  });
});
