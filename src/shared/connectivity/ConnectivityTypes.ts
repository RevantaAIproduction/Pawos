/**
 * Connectivity Runtime — shared contract every connector, connection, and
 * event conforms to. This file carries zero provider-specific logic; it is
 * the vocabulary the rest of the runtime (registries, managers, IPC, UI)
 * is written against, so a new connector never requires a runtime change.
 */

import type { FeatureId } from '../billing/BillingTypes';

/**
 * Which connectors require a paid-tier feature flag before the Connections UI enables their
 * Connect button — read via `ipc.entitlementIsFeatureAvailable`/`entitlementGetSnapshot`, never a
 * hardcoded tier name in the UI itself (see EntitlementService.ts's TIER_ENTITLEMENTS for which
 * tier actually grants each FeatureId). GitHub/GitLab/Vercel/Netlify/Railway are intentionally
 * absent — free on every tier, no gate.
 */
export const CONNECTOR_REQUIRED_FEATURE: Partial<Record<string, FeatureId>> = {
  linear: 'connectLinear',
  googleWorkspace: 'connectGoogleWorkspace',
  jira: 'connectJira',
  slack: 'connectSlack',
};

export type ConnectorCategory =
  | 'sourceControl'
  | 'projectManagement'
  | 'communication'
  | 'hosting'
  | 'cloud'
  | 'container'
  | 'cicd'
  | 'ssh'
  | 'database'
  | 'restApi'
  | 'mcpServer'
  | 'localApplication'
  | 'productivity'
  | 'other';

/** User-facing labels for the categories the capability-requirement UI surfaces (RequirementGate /
 *  CapabilityRequirementResolver). Not every ConnectorCategory needs a label here — only the ones
 *  a requirement is ever declared against. */
export const CONNECTOR_CATEGORY_LABELS: Partial<Record<ConnectorCategory, string>> = {
  projectManagement: 'Ticket Access',
  sourceControl: 'Repository Access',
  hosting: 'Deployment Access',
  cloud: 'Cloud Access',
  database: 'Database Access',
  communication: 'Communication Access',
  productivity: 'Productivity & Documents',
};

export type AuthMethod = 'oauth2' | 'apiToken' | 'sshKey' | 'none';

/**
 * The platform-wide connector lifecycle. Every ConnectorSDK implementation — current and future —
 * moves through these states and no others:
 *
 *   Disconnected -> Connecting -> Connected -> Syncing -> Connected -> Expired -> Requires Re-auth -> Error
 *
 * Transitions:
 *   disconnected      --(user clicks Connect)-->            connecting
 *   connecting        --(OAuth/token exchange succeeds)-->  connected
 *   connecting        --(fails)-->                          error
 *   connected         --(sync() starts)-->                  syncing
 *   syncing           --(sync completes)-->                 connected
 *   connected         --(token TTL elapses)-->               expired
 *   expired           --(refresh() succeeds)-->              connected
 *   expired           --(refresh fails / provider revoked)--> requiresReauth
 *   requiresReauth    --(user clicks Connect/Grant)-->       connecting
 *   any state         --(unexpected failure)-->              error
 *   error             --(user retries)-->                    connecting
 *   any state         --(user clicks Disconnect)-->          disconnected
 */
export type ConnectorLifecycleState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'expired'
  | 'requiresReauth'
  | 'error';

/**
 * The first-class, live status model every `ConnectorSDK.getStatus()` returns. Read-only by
 * contract — see `ConnectorSDK.getStatus`'s own doc comment for the rules a connector must follow
 * when reporting this.
 */
export interface ConnectorStatus {
  state: ConnectorLifecycleState;
  /** The live, possibly-narrower-than-declared capability set — mirrors `ConnectorSDK.capabilities()`. */
  capabilities: string[];
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  detail?: string;
}

/**
 * Describes one declared capability for AI Runtime / tool-calling discovery — the connector
 * platform is the AI Runtime's execution layer, not only an auth surface. `id` matches an entry in
 * `ConnectorDefinition.capabilities`; `params` is intentionally loose (no full JSON-Schema this
 * pass) since only two connectors populate it today (see `capabilityDescriptors` below).
 */
export interface CapabilityDescriptor {
  id: string;
  label: string;
  description: string;
  params?: Record<string, { type: string; description: string; required?: boolean }>;
}

/** Maps the richer live `ConnectorLifecycleState` down to `ConnectorConnection.status`'s narrower,
 *  Supabase-backed set — `connecting`/`syncing` collapse to `connected` (both are "in the middle of
 *  an already-connected flow" from a persisted-record point of view), `expired`/`requiresReauth`
 *  collapse to `needsReauth`. */
export function connectorLifecycleToConnectionStatus(
  state: ConnectorLifecycleState
): ConnectorConnection['status'] {
  switch (state) {
    case 'disconnected':
      return 'disconnected';
    case 'connecting':
    case 'syncing':
    case 'connected':
      return 'connected';
    case 'expired':
    case 'requiresReauth':
      return 'needsReauth';
    case 'error':
      return 'error';
  }
}

export interface OAuthConnectorConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Env var name to read at exchange time — never the literal secret itself. */
  clientIdEnvVar: string;
  /** Absent for a PKCE-only public client (`usePkce: true`) — OAuthManager's exchange/refresh
   *  methods never read this field at all in that case, since there is no secret to send. */
  clientSecretEnvVar?: string;
  /** PKCE-only public client (no client secret ever sent) — OAuthManager generates a
   *  code_verifier/code_challenge pair and does the token exchange with just client_id.
   *  `clientSecretEnvVar` is ignored entirely for a connector that sets this true. */
  usePkce?: boolean;
  /** Endpoint OAuthManager.revokeToken() posts to. Absent means the provider has no
   *  revocation endpoint declared — revokeToken() then no-ops (logs, doesn't throw)
   *  rather than inventing a call the provider never documented. */
  revocationUrl?: string;
  /** When true, every authorize URL OAuthManager builds for this connector includes
   *  `include_granted_scopes=true` — the standard signal (Google and compatible
   *  providers) that a new token should union with whatever was already granted,
   *  rather than replace it. Harmless to set even for a full connect. */
  supportsIncrementalAuth?: boolean;
  /** When true, OAuthManager redirects through a temporary http://127.0.0.1:<ephemeral-port>
   *  listener instead of the pawos:// custom-protocol redirect — the Google-documented
   *  loopback flow for Desktop-app OAuth clients, which do not accept arbitrary custom URI
   *  schemes as a redirect target (confirmed live: Google rejects pawos:// with "Error 400:
   *  invalid_request" for this client type). Generic — any future OAuth connector whose
   *  provider has the same Desktop-client restriction sets this the same way. Absent/false
   *  keeps the existing pawos:// protocol-callback path unchanged. */
  useLoopbackRedirect?: boolean;
  /** Extra static query params OAuthManager.buildAuthorizationUrl adds to the authorize request —
   *  e.g. Atlassian/Jira requires `audience=api.atlassian.com` and `prompt=consent`. Absent for
   *  every provider that needs nothing beyond the standard client_id/redirect_uri/scope/
   *  response_type set. */
  extraAuthParams?: Record<string, string>;
  /** Env var naming this connector's own already-registered, pawos-web-hosted callback URL (e.g.
   *  CONNECTOR_VERCEL_CALLBACK_URL) — used instead of the generic CONNECTIVITY_OAUTH_REDIRECT_URI
   *  when the provider's OAuth app was registered with one specific callback URL rather than
   *  PawOS's pawos:// custom scheme. pawos-web's route at that path is a thin relay (forwards the
   *  raw code/state/error on to pawos://connectivity-oauth-callback, exactly like the existing
   *  GitHub/Google sign-in relays) — it never itself performs the token exchange; that still
   *  happens via OAuthManager.exchangeCodeForToken -> /api/connectivity/oauth/exchange. */
  redirectUriEnvVar?: string;
}

/**
 * Declared once by a connector adapter. Together with ConnectorConnection below,
 * this satisfies all 7 required facets: Metadata + Authentication Method +
 * Capabilities + Events live here (declared, connector-authored); Connection
 * Status + Health Status + Permissions live on the per-user/org Connection
 * instance (runtime state).
 */
export interface ConnectorDefinition {
  /** 'github', 'jira', 'slack', 'ssh-generic' — unique across the registry. */
  id: string;
  displayName: string;
  /** One plain-language sentence for the Integrations UI — what connecting this actually gets you.
   *  Absent falls back to the category label; never render raw category/authMethod enum text to users. */
  description?: string;
  category: ConnectorCategory;
  authMethod: AuthMethod;
  /** Present only when authMethod === 'oauth2'. */
  oauth?: OAuthConnectorConfig;
  /** Present only when authMethod === 'apiToken'. */
  apiTokenHelp?: {
    instructionsUrl: string;
    fieldLabel: string;
    /** Extra fields collected before the token itself (e.g. Jira's site URL + email), each
     *  becoming a key in the JSON credential object passed to the connector's own authenticate() —
     *  ApiTokenManager never interprets these values, only collects and forwards them. Absent means
     *  today's single-token flow (the credential is `{ apiToken: <token> }`), unchanged. */
    additionalFields?: { name: string; label: string; type?: 'text' | 'password' }[];
  };
  /** Declarative, e.g. ['readTickets', 'createPullRequest']. */
  capabilities: string[];
  /** Optional, richer AI-Runtime-facing description of each entry in `capabilities` — absent
   *  entries simply aren't discoverable by name/description yet, not an error. */
  capabilityDescriptors?: CapabilityDescriptor[];
  /** Event names this connector can emit, e.g. ['issue.created']. */
  events?: string[];
  healthCheck?: { path: string; method: 'GET' };
  /**
   * 'automatic' = the connector calls the provider's own webhook-management
   * API to create/update/remove the webhook itself during connect()/
   * disconnect(). 'manual' = no such API exists; the Connections UI must
   * show the generated URL + setup instructions instead. Absent entirely
   * for connectors with no `events`.
   */
  webhookRegistration?: 'automatic' | 'manual';
}

/** Always owned by a user; additionally org-scoped only when relevant — no
 *  universal "workspace" concept exists in this codebase (confirmed: solo
 *  users have zero row in organizations/organization_workspaces). */
export type ConnectivityScope = { userId: string; organizationId?: string };

export interface ConnectorConnection {
  id: string;
  connectorId: string;
  scope: ConnectivityScope;
  /** This persisted-record status stays its original, narrower shape — it's backed by a Supabase
   *  column with a matching check constraint (`connectivity_runtime_persistence` migration).
   *  Widening it to the full ConnectorLifecycleState is a schema migration, out of scope for this
   *  pass; `connectorLifecycleToConnectionStatus()` below maps the richer live state down to this
   *  set whenever a connection record needs updating from a `ConnectorStatus`. */
  status: 'connected' | 'disconnected' | 'error' | 'needsReauth';
  grantedPermissions: string[];
  lastSyncAt?: number;
  lastHealthCheckAt?: number;
  healthStatus?: 'healthy' | 'degraded' | 'down';
  metadata: Record<string, unknown>;
}

/** Every connector's event becomes exactly this shape before anything else in PawOS sees it. */
export interface NormalizedConnectivityEvent {
  connectorId: string;
  event: string;
  scope: ConnectivityScope;
  payload: Record<string, unknown>;
  receivedAt: number;
}

export type DeploymentProfileConfig =
  | { kind: 'managedPlatform'; connectorId: string }
  | {
      kind: 'ssh';
      host: string;
      port?: number;
      username: string;
      /** Points at a Credential Vault entry with authMethod 'sshKey'. */
      credentialRef: string;
      /** Pre-approved once at profile-creation time; run without a fresh
       *  confirmation each time since the user already reviewed this exact
       *  list before saving the profile. */
      deployCommands?: string[];
      /** If true, any command NOT in deployCommands still needs a fresh
       *  per-run confirmation before executing. */
      requireApprovalForAdHocCommands: boolean;
    };

export interface DeploymentProfile {
  id: string;
  scope: ConnectivityScope;
  name: string;
  config: DeploymentProfileConfig;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ProjectSourceDescriptor =
  | { kind: 'localFolder'; path: string }
  | { kind: 'pawWorkspace'; workspaceId: string }
  | { kind: 'uploadedZip'; zipPath: string }
  | { kind: 'githubRepo'; connectorId: string; repo: string; ref?: string }
  | { kind: 'gitlabRepo'; connectorId: string; repo: string; ref?: string };

export interface DiscoveredCapability {
  id: string;
  displayName: string;
  available: boolean;
  version?: string;
  path?: string;
}

/** The response envelope every `connectivity:*` IPC channel resolves with
 *  — shared between the main-process handler (connectivityIpc.ts) and the
 *  preload/renderer bridge layers so all three sides agree on one shape. */
export type ConnectivityIpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Shared with ApiTokenManager.ts so the same shape crosses the IPC
 *  boundary without a second, IPC-only type being declared for it. */
export interface ApiTokenValidationResult {
  valid: boolean;
  reason?: string;
}

/** The serializable subset of OAuthManager's `OAuthAuthorizationHandle` —
 *  everything except the `result` promise, which cannot cross IPC. The
 *  renderer never awaits authorization completion directly; it only needs
 *  the URL (already opened by the main process) and the id to cancel by. */
export interface OAuthBeginResult {
  requestId: string;
  authorizationUrl: string;
}
