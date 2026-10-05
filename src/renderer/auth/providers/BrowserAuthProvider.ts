import type { User as SupabaseUser } from '@supabase/supabase-js';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

function toAuthUser(user: SupabaseUser): AuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.user_name === 'string' && meta.user_name) ||
    user.email ||
    'PawOS User';
  const pictureUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : typeof meta.picture === 'string' ? meta.picture : undefined;
  return {
    id: user.id,
    name,
    email: user.email,
    pictureUrl,
    // Restored from the real Supabase session on every start (AuthenticationProvider.getCurrentUser),
    // whichever method the account itself was created with.
    provider: 'email',
    isGuest: false,
    createdAt: Date.now(),
  };
}

/**
 * "Continue with browser": the account signed in on PawOS Web, without signing in again here.
 * The main process runs the browser handoff (src/main/auth/WebSignInFlow.ts) and returns a one-time
 * token hash; verifying it gives this app its own Supabase session.
 */
export class BrowserAuthProvider {
  async signIn(): Promise<AuthUser> {
    try {
      const { tokenHash } = await ipc.authStartWebSignIn();
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (error || !data.user || !data.session) throw new Error(error?.message ?? 'Signing in with the browser did not return a session.');
      return toAuthUser(data.user);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
