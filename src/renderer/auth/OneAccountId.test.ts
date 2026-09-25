import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authStartGoogleSignIn: vi.fn(),
  signInWithIdToken: vi.fn(),
  getSession: vi.fn(),
  billingReconcileForAccount: vi.fn(async () => ({})),
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: {
    authStartGoogleSignIn: mocks.authStartGoogleSignIn,
    authIsGoogleSignInConfigured: vi.fn(async () => true),
    billingReconcileForAccount: mocks.billingReconcileForAccount,
    billingClearBuildAccess: vi.fn(async () => {}),
    billingSyncBuildAccess: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('./supabaseClient', () => ({
  getSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithIdToken: mocks.signInWithIdToken,
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
    mocks.authStartGoogleSignIn.mockResolvedValue({ profile, idToken: 'id-token', accessToken: 'access-token' });
  });

  it('Google sign-in uses the PawOS server account id (the same one email/GitHub give)', async () => {
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: { id: SERVER_ID } }, error: null });
    const user = await new GoogleAuthProvider().signIn();
    expect(user.id).toBe(SERVER_ID);
    expect(user.email).toBe('tharun.esta@gmail.com');
  });

  it('never falls back to a local-only "google:…" id — sign-in stops with a clear message instead', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: null }, error: { message: 'Unacceptable audience in id_token' } });
    await expect(new GoogleAuthProvider().signIn()).rejects.toThrow(/could not connect it to your account/);
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
