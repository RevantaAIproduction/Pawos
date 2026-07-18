import type { AuthUser } from '../AuthTypes';

/**
 * Local-only session, no network call — a guest gets a real local profile
 * (companion, memories, settings all already work the same way regardless
 * of who's "signed in", since none of PawOS's local stores are namespaced
 * per-user yet). What a guest doesn't get: cloud sync, subscriptions, token
 * purchases, backup, or cross-device sync — none of those exist in this
 * build yet either way, so this is an honest description of a real
 * limitation, not a fabricated one.
 */
export class GuestAuthProvider {
  async continueAsGuest(): Promise<AuthUser> {
    return {
      id: `guest:${crypto.randomUUID()}`,
      name: 'Guest',
      provider: 'guest',
      isGuest: true,
      createdAt: Date.now(),
    };
  }
}
