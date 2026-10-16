import { useEffect } from 'react';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { connectionManagerService } from './ConnectionManagerService';
import { connectivityCredentialService } from './ConnectivityCredentialService';
import { deploymentProfileService } from './DeploymentProfileService';
import type { ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import { connectorLifecycleToConnectionStatus } from '../../shared/connectivity/ConnectivityTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const scopeKey = (scope: ConnectivityScope) => `${scope.userId}:${scope.organizationId ?? ''}`;

/**
 * The restore of one signed-in session. Module-level, not React state — it outlives the components
 * that mount and unmount while the user moves around the app, so the restore underneath runs once
 * per signed-in session, not once per visit.
 *
 *   running — a restore is under way (never two at once for a session)
 *   pending — the last attempt could not finish because Supabase was unreachable or the main
 *             process had not verified this account yet; retried only once the main process
 *             confirms this account (noteConnectivityAccountVerified)
 *   done    — restored; nothing runs again in this session
 */
type RestoreSession = { key: string; scope: ConnectivityScope; phase: 'running' | 'pending' | 'done'; retryWanted: boolean };
let session: RestoreSession | null = null;

/** The account the signed-in Dashboard is showing — a restore is only ever started for it. */
let wanted: ConnectivityScope | null = null;

/**
 * Whether restore should run now for `scope` — true once per signed-in session of that account,
 * and marks it as run. A different account (or organization) is a new session, and replaces the
 * previous one (whose restore, if still running, stops at its next step).
 */
export function claimConnectivityBootstrap(scope: ConnectivityScope): boolean {
  const key = scopeKey(scope);
  if (session?.key === key) return false;
  session = { key, scope, phase: 'running', retryWanted: false };
  return true;
}

/**
 * Sign-out ends the session: the main process forgets every connector credential it held, so the
 * next sign-in — even by the same account, without restarting PawOS — must restore them again. A
 * restore still running or waiting to be retried for the old session is abandoned.
 */
export function resetConnectivityBootstrap(): void {
  session = null;
}

/**
 * The main process has verified `userId` as the signed-in account (sent by the session sync after
 * every sign-in, token refresh and reconnection). A restore that could not finish — offline at
 * startup, or before the main process had verified this account — is retried now, once; one that
 * is still running is retried once more if it then fails. Never for any other account.
 */
export function noteConnectivityAccountVerified(userId: string): void {
  if (session && session.scope.userId === userId) {
    if (session.phase === 'pending') {
      session.phase = 'running';
      void runRestore(session);
    } else if (session.phase === 'running') {
      session.retryWanted = true;
    }
    return;
  }
  // No session for the Dashboard's account (e.g. a momentary signed-out state while offline reset
  // it): start one now that this account is verified.
  if (wanted && wanted.userId === userId && claimConnectivityBootstrap(wanted)) void runRestore(session!);
}

/** A refusal meaning "not (yet) this account" — from the main process or the credential store — not a broken connector. */
const NOT_SIGNED_IN = /isn't (?:for )?the account signed in|isn't signed in/;
const notYetSignedIn = (result: { ok: boolean; error?: string } | undefined) => !!result && !result.ok && NOT_SIGNED_IN.test(result.error ?? '');

class NotYetRestorable extends Error {}

async function runRestore(state: RestoreSession): Promise<void> {
  let outcome: 'done' | 'retry';
  try {
    outcome = (await restore(state.scope, () => session === state)) ? 'done' : 'retry';
  } catch (e) {
    outcome = 'retry';
    console.error('[connectivity] bootstrap restore failed:', getErrorMessage(e));
  }
  // (Signed out or another account meanwhile: `state` is no longer the session, and its restore
  // already stopped at its next step — whatever is recorded on it below reaches nothing.)
  if (outcome === 'done') {
    state.phase = 'done';
  } else if (state.retryWanted) {
    // The account was confirmed again while this attempt ran (e.g. the network came back): one more try.
    state.retryWanted = false;
    void runRestore(state);
  } else {
    state.phase = 'pending';
  }
}

/**
 * Activates every persisted connector credential into the main process's in-memory state via
 * `connectivity:restore` (which calls `authenticate()`, never `connect()`/OAuth), then mirrors live
 * status and hydrates deployment profiles. True when it finished; false when it must be retried
 * (Supabase unreachable, or this account not verified by the main process yet) or was abandoned.
 */
async function restore(scope: ConnectivityScope, current: () => boolean): Promise<boolean> {
  const step = <T,>(work: () => Promise<T>) => {
    if (!current()) throw new NotYetRestorable();
    return work();
  };
  try {
    // Supabase unreachable (offline) throws here — the whole restore is retried later.
    const credentialMetas = await step(() => connectivityCredentialService.listMetadata(scope));
    for (const meta of credentialMetas) {
      const decrypted = await step(() => connectivityCredentialService.read(scope, meta.connectorId));
      if (!decrypted) continue;
      // ApiTokenManager.save() already parses+authenticates before persisting — reusing it here
      // keeps apiToken restoration on the exact same validated path a fresh submit uses.
      const result =
        meta.authMethod === 'apiToken'
          ? await step(() => ipc.connectivityApiTokensSave(meta.connectorId, scope, decrypted.secret))
          : await step(() =>
              ipc.connectivityRestore(meta.connectorId, scope, {
                accessToken: decrypted.secret,
                refreshToken: decrypted.refreshToken,
                expiresAt: decrypted.expiresAt,
              })
            );
      // Any other failure is this connector's own (not registered this session, or the stored
      // credential no longer authenticates) — expected, and not retried.
      if (notYetSignedIn(result)) return false;
    }

    const persistedConnections = await step(() => connectionManagerService.list(scope));
    for (const persisted of persistedConnections) {
      const statusResult = await step(() => ipc.connectivityGetStatus(persisted.connectorId, scope));
      if (notYetSignedIn(statusResult)) return false;
      if (statusResult.ok) {
        await step(() =>
          connectionManagerService.upsert(scope, {
            ...persisted,
            status: connectorLifecycleToConnectionStatus(statusResult.data.state),
            grantedPermissions: statusResult.data.capabilities,
          })
        );
      }
    }

    const persistedProfiles = await step(() => deploymentProfileService.list(scope));
    for (const profile of persistedProfiles) {
      const hydrated = await step(() => ipc.connectivityDeploymentProfilesHydrate(profile));
      if (notYetSignedIn(hydrated)) return false;
    }
    return true;
  } catch (e) {
    if (e instanceof NotYetRestorable) return false;
    throw e;
  }
}

/**
 * The one explicit restoration entry point on the renderer side — run from the signed-in Dashboard
 * shell, so connectors are live from startup without the user opening Settings. Runs once per
 * signed-in session; if that attempt cannot finish (offline, or the account not verified yet) it is
 * retried when the main process confirms the account — never on a timer, never twice at once.
 *
 * This is deliberately NOT part of `ConnectionsPage.tsx` — that page is pure status discovery (see
 * its own doc comment) and must never itself trigger authentication.
 */
export function useConnectivityBootstrap(scope: ConnectivityScope | null): void {
  useEffect(() => {
    // Signed out: nothing to restore (and nothing is claimed, so the next sign-in restores).
    if (!scope) return;
    wanted = scope;
    if (claimConnectivityBootstrap(scope)) void runRestore(session!);
    return () => {
      if (wanted === scope) wanted = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.userId, scope?.organizationId]);
}
