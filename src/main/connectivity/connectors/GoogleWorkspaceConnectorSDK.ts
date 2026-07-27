import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import type { CalendarEventDraft } from '../../../shared/office/OfficeTypes';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { guestConnectorCredentialStore } from '../../infrastructure/GuestConnectorCredentialStore';
import { officeConnectorRegistry } from '../../office/OfficeConnectorRegistry';
import { GoogleDriveConnector } from '../../office/google/GoogleDriveConnector';
import { GmailConnector } from '../../office/google/GmailConnector';
import { GoogleCalendarConnector } from '../../office/google/GoogleCalendarConnector';
import { GoogleContactsConnector } from '../../office/google/GoogleContactsConnector';

const GOOGLE_SCOPE = {
  driveFile: 'https://www.googleapis.com/auth/drive.file',
  driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar',
  contactsReadonly: 'https://www.googleapis.com/auth/contacts.readonly',
  userinfoEmail: 'https://www.googleapis.com/auth/userinfo.email',
};

/**
 * Maps a declared capability name to the Google OAuth scope backing it — the only Google-specific
 * piece of the incremental-authorization design (see `ConnectorSDK.connect`'s
 * `opts.incrementalCapabilities` doc comment and `RequirementTypes.ts`'s `CapabilityRequirement`).
 * Every other Runtime layer (OAuthManager, CredentialVaultBridge, CapabilityRequirementResolver,
 * RequirementGate) only ever passes capability *names* around and never interprets a scope
 * string — a future Microsoft/Dropbox/Slack/Notion/GitHub connector supplies its own equivalent
 * table without any of that shared infrastructure changing.
 */
const CAPABILITY_TO_SCOPE: Record<string, string> = {
  listFiles: GOOGLE_SCOPE.driveReadonly,
  readFile: GOOGLE_SCOPE.driveReadonly,
  uploadFile: GOOGLE_SCOPE.driveFile,
  listEvents: GOOGLE_SCOPE.calendar,
  findFreeSlots: GOOGLE_SCOPE.calendar,
  createEvent: GOOGLE_SCOPE.calendar,
  rescheduleEvent: GOOGLE_SCOPE.calendar,
  listThreads: GOOGLE_SCOPE.gmailReadonly,
  readThread: GOOGLE_SCOPE.gmailReadonly,
  listContacts: GOOGLE_SCOPE.contactsReadonly,
};

const ALL_SCOPES = [GOOGLE_SCOPE.userinfoEmail, ...new Set(Object.values(CAPABILITY_TO_SCOPE))];

interface GoogleWorkspaceCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** The full union of scopes ever granted across every full connect and incremental grant —
   *  read from CredentialVaultBridge.StoredCredential.grantedScopes on restart. */
  grantedScopes: string[];
}

/**
 * PawOS's first OAuth2 `ConnectorSDK` — first production connector after Jira (apiToken).
 * Mirrors `JiraConnectorSDK`'s exact shape (authenticate/connect/disconnect/refresh/validate/
 * health/capabilities/execute), adapted for a PKCE-only public OAuth client instead of an API
 * token: `connect()` drives the full interactive `OAuthManager.beginAuthorization` →
 * `exchangeCodeForToken` round trip (or, when `opts.incrementalCapabilities` is set on an
 * already-connected scope, requests only the missing scopes and merges the result — see
 * `capabilities()` and the merge step below); `authenticate()` restores a session from a
 * previously-stored credential (restart hydration, mirroring Jira's guest-store reconnect at
 * main.ts:343-346). Successful activation registers real `DocumentProviderConnector`/
 * `MailboxProviderConnector`/`CalendarProviderConnector`/`ContactsProviderConnector` instances
 * into `officeConnectorRegistry` — the same OFF-1 scaffold OFF-3..OFF-7's plugins already read
 * from, so nothing above this file needs to change for Drive/Gmail/Calendar/Contacts actions to
 * start working.
 */
export class GoogleWorkspaceConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'googleWorkspace',
    displayName: 'Google Workspace',
    description: 'Drive, Gmail, Calendar and Contacts — connected with your Google account.',
    category: 'productivity' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revocationUrl: 'https://oauth2.googleapis.com/revoke',
      usePkce: true,
      supportsIncrementalAuth: true,
      // Google rejects a custom pawos:// redirect for a Desktop-app OAuth client outright
      // (confirmed live: "Error 400: invalid_request" / policy violation) — Desktop clients only
      // accept the loopback (http://127.0.0.1:<port>) redirect OAuthManager provides for this flag.
      useLoopbackRedirect: true,
      scopes: ALL_SCOPES,
      // A dedicated "Desktop app" OAuth client — deliberately distinct from GOOGLE_CLIENT_ID
      // (the existing sign-in client, a "Web application" type whose secret lives server-side
      // in pawos-web). Confirmed live: Google's Desktop-app client type still requires
      // client_secret in the token request even with PKCE (Error: "client_secret is missing"
      // without it) — Google's own docs explicitly say this value isn't treated as confidential
      // for this client type, since it's expected to be embedded in an installed app binary.
      // Still never sent anywhere but directly to Google — no server relay.
      clientIdEnvVar: 'GOOGLE_WORKSPACE_CLIENT_ID',
      clientSecretEnvVar: 'GOOGLE_WORKSPACE_CLIENT_SECRET',
    },
    capabilities: Object.keys(CAPABILITY_TO_SCOPE),
    capabilityDescriptors: [
      { id: 'listFiles', label: 'List files', description: 'List files in Google Drive matching a query.' },
      { id: 'readFile', label: 'Read file', description: 'Read the contents of a Google Drive file by id.' },
      { id: 'uploadFile', label: 'Upload file', description: 'Upload a local file to Google Drive.' },
      { id: 'listEvents', label: 'List calendar events', description: 'List upcoming Google Calendar events within a day range.' },
      { id: 'findFreeSlots', label: 'Find free slots', description: 'Find open meeting slots across a set of attendees.' },
      { id: 'createEvent', label: 'Create calendar event', description: 'Create a new Google Calendar event.' },
      { id: 'rescheduleEvent', label: 'Reschedule calendar event', description: 'Move an existing Google Calendar event to a new time.' },
      { id: 'listThreads', label: 'List email threads', description: 'List recent Gmail threads (read-only).' },
      { id: 'readThread', label: 'Read email thread', description: 'Read a Gmail thread by id (read-only).' },
      { id: 'listContacts', label: 'List contacts', description: 'Search Google Contacts.' },
    ],
    healthCheck: { path: 'https://www.googleapis.com/oauth2/v3/userinfo', method: 'GET' as const },
  };

  private credential: GoogleWorkspaceCredential | undefined;
  /** Populated only by authenticate()/connect()/disconnect()/refresh() — getStatus() only ever
   *  reads this field, never derives, fetches, or restores it itself. */
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };
  private readonly drive = new GoogleDriveConnector(undefined);
  private readonly gmail = new GmailConnector(undefined);
  private readonly calendar = new GoogleCalendarConnector(undefined);
  private readonly contacts = new GoogleContactsConnector(undefined);

  /** Pushes the current access token into all 4 office connectors and (re-)registers them. A
   *  token refresh mutates these same instances in place rather than re-registering new ones —
   *  unlike Jira's disconnect(), which really does need a fresh placeholder instance because
   *  InfrastructureConnectorRegistry has no unregister(), a routine token refresh is not a
   *  connect/disconnect transition and doesn't need one either. */
  private activate(): void {
    const token = this.credential?.accessToken ?? '';
    this.drive.setAccessToken(token);
    this.gmail.setAccessToken(token);
    this.calendar.setAccessToken(token);
    this.contacts.setAccessToken(token);
    officeConnectorRegistry.register('documentProvider', this.drive);
    officeConnectorRegistry.register('mailboxProvider', this.gmail);
    officeConnectorRegistry.register('calendarProvider', this.calendar);
    officeConnectorRegistry.register('contactsProvider', this.contacts);
  }

  private toConnection(scope: ConnectivityScope): ConnectorConnection {
    return {
      id: `googleWorkspace:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: {},
    };
  }

  /** Restart hydration path (mirrors Jira's authenticate(scope, savedCredential) call at
   *  main.ts:343-346) — also the internal step `connect()` delegates to once it has a fresh
   *  token from the OAuth round trip. */
  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<GoogleWorkspaceCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || !c.accessToken) {
      throw new Error('Google Workspace credential must include an accessToken.');
    }
    this.credential = {
      accessToken: c.accessToken,
      refreshToken: c.refreshToken,
      expiresAt: c.expiresAt,
      grantedScopes: c.grantedScopes ?? [],
    };
    this.activate();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString() };
  }

  async connect(scope: ConnectivityScope, opts?: { incrementalCapabilities?: string[] }): Promise<ConnectorConnection> {
    // `existing` is normalized to GoogleWorkspaceCredential's own field names regardless of
    // whether it came from in-memory state (already that shape) or a fresh vault read (which
    // stores the access token under `secret`, per CredentialVaultBridge.StoredCredential) — a
    // previous version of this method read `credentialVaultBridge.read()`'s result directly and
    // passed it to authenticate(), which expects `.accessToken`, not `.secret`.
    const stored = this.credential ? undefined : await credentialVaultBridge.read(this.definition.id, scope);
    const existing: GoogleWorkspaceCredential | undefined = this.credential
      ?? (stored ? { accessToken: stored.secret, refreshToken: stored.refreshToken, expiresAt: stored.expiresAt, grantedScopes: stored.grantedScopes ?? [] } : undefined);
    const existingScopes = existing?.grantedScopes ?? [];

    let scopesToRequest: string[];
    if (opts?.incrementalCapabilities && existing) {
      const wanted = opts.incrementalCapabilities.map((cap) => CAPABILITY_TO_SCOPE[cap]).filter((s): s is string => Boolean(s));
      scopesToRequest = [...new Set(wanted.filter((s) => !existingScopes.includes(s)))];
      if (scopesToRequest.length === 0) {
        // Every requested capability is already granted — nothing to authorize, just make sure
        // this instance is activated (e.g. a fresh process that hasn't called authenticate() yet).
        if (!this.credential) await this.authenticate(scope, existing);
        return this.toConnection(scope);
      }
    } else if (existing) {
      // A full (non-incremental) connect() call with a credential already on file — reactivate
      // the existing session instead of forcing a brand-new consent screen. Without this check,
      // *every* call to connect() (including Settings hydration re-running on every page visit,
      // and clicking "Connect" again after a restart) unconditionally opened the system browser
      // for a fresh OAuth round trip, even when a perfectly good stored token already existed.
      if (!this.credential) await this.authenticate(scope, existing);
      return this.toConnection(scope);
    } else {
      scopesToRequest = ALL_SCOPES;
    }

    this.currentStatus = { state: 'connecting', capabilities: this.capabilities() };
    let token: Awaited<ReturnType<typeof oauthManager.exchangeCodeForToken>>;
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope, { scopesOverride: scopesToRequest });
      const { code, codeVerifier, redirectUri } = await handle.result;
      token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: this.capabilities(), lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }

    // Merge, never trust: even with include_granted_scopes=true, this union is computed here
    // rather than assumed from the response, so correctness never depends on provider behavior.
    const mergedScopes = [...new Set([...existingScopes, ...(token.grantedScopes ?? scopesToRequest)])];

    this.credential = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? existing?.refreshToken,
      expiresAt: token.expiresAt,
      grantedScopes: mergedScopes,
    };
    await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', {
      refreshToken: this.credential.refreshToken,
      expiresAt: this.credential.expiresAt,
      grantedScopes: mergedScopes,
    });
    if (scope.userId === 'guest') {
      // No Supabase session to persist through the Vault — same local, safeStorage-encrypted
      // fallback Jira's Guest-mode path already uses, generic over connectorId. The credential
      // bundle is JSON-packed into one field since GuestConnectorCredentialStore is a flat
      // string map (never a schema change to that store).
      guestConnectorCredentialStore.save(this.definition.id, { bundle: JSON.stringify(this.credential) });
    }
    this.activate();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString() };
    return this.toConnection(scope);
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    if (this.credential?.accessToken) {
      await oauthManager.revokeToken(this.definition.id, this.credential.accessToken);
    }
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    guestConnectorCredentialStore.remove(this.definition.id);
    // No unregister() on OfficeConnectorRegistry (deliberately not widened this pass, the exact
    // same constraint JiraConnectorSDK already works around on InfrastructureConnectorRegistry)
    // — blanking the access token on the same registered instances makes isConfigured() honestly
    // report false everywhere they're read from.
    this.activate();
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential?.refreshToken) return;
    try {
      const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
      this.credential = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        grantedScopes: result.grantedScopes ?? this.credential.grantedScopes,
      };
      this.activate();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt ?? new Date().toISOString() };
    } catch (error) {
      // Refresh token itself was rejected (revoked externally, etc.) — the connection is dead;
      // report it honestly as needing re-auth rather than silently keeping a stale access token.
      this.credential = undefined;
      this.activate();
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Strictly read-only — see ConnectorSDK.getStatus's contract. Never validates live, never
   *  touches the vault; only reflects whatever the last connect/authenticate/disconnect/refresh
   *  call already put in currentStatus. */
  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Google Workspace is not connected.' };
    try {
      const res = await fetch(this.definition.healthCheck.path, {
        headers: { Authorization: `Bearer ${this.credential.accessToken}` },
      });
      if (res.ok) return { valid: true };
      return { valid: false, reason: `Google rejected the current access token (HTTP ${res.status}).` };
    } catch (error) {
      return { valid: false, reason: `Couldn't reach Google: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy' } : { status: 'down', detail: result.reason };
  }

  /** The live, possibly-narrower-than-declared capability set — derived from the actually
   *  granted scopes, not the originally requested list, per ConnectorSDK's own contract. */
  capabilities(): string[] {
    if (!this.credential) return [];
    const granted = this.credential.grantedScopes;
    return Object.entries(CAPABILITY_TO_SCOPE)
      .filter(([, scope]) => granted.includes(scope))
      .map(([capability]) => capability);
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    // No push/webhook notifications this pass (definition declares no `events`) — no-op.
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.credential) throw new Error('Google Workspace is not connected.');
    switch (action) {
      case 'listFiles':
        return this.drive.listFiles(params.query as string | undefined);
      case 'readFile':
        return this.drive.readFile(String(params.fileId));
      case 'uploadFile':
        return this.drive.uploadFile(String(params.name), String(params.localPath));
      case 'listEvents':
        return this.calendar.listUpcomingEvents(Number(params.withinDays ?? 7));
      case 'findFreeSlots':
        return this.calendar.findFreeSlots(
          (params.attendees as string[] | undefined) ?? [],
          Number(params.durationMinutes ?? 30),
          Number(params.withinDays ?? 7)
        );
      case 'createEvent':
        return this.calendar.createEvent(params.draft as CalendarEventDraft);
      case 'rescheduleEvent':
        return this.calendar.rescheduleEvent(String(params.eventId), String(params.startsAt), String(params.endsAt));
      case 'listThreads':
        return this.gmail.listRecentThreads(Number(params.maxResults ?? 20));
      case 'readThread':
        return this.gmail.readThread(String(params.threadId));
      case 'listContacts':
        return this.contacts.listContacts(params.query as string | undefined);
      default:
        throw new Error(`GoogleWorkspaceConnectorSDK does not support action "${action}".`);
    }
  }
}

/** One instance shared by connectorRegistry, IPC, and startup reconnection — every caller must
 *  reference the same instance since it holds the in-memory credential state (identical
 *  constraint to jiraConnectorSDK). */
export const googleWorkspaceConnectorSDK = new GoogleWorkspaceConnectorSDK();
