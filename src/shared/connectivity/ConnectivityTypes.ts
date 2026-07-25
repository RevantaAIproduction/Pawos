/**
 * Connectivity Runtime — shared contract every connector, connection, and
 * event conforms to. This file carries zero provider-specific logic; it is
 * the vocabulary the rest of the runtime (registries, managers, IPC, UI)
 * is written against, so a new connector never requires a runtime change.
 */

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
  | 'other';

export type AuthMethod = 'oauth2' | 'apiToken' | 'sshKey' | 'none';

export interface OAuthConnectorConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Env var name to read at exchange time — never the literal secret itself. */
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
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
  category: ConnectorCategory;
  authMethod: AuthMethod;
  /** Present only when authMethod === 'oauth2'. */
  oauth?: OAuthConnectorConfig;
  /** Present only when authMethod === 'apiToken'. */
  apiTokenHelp?: { instructionsUrl: string; fieldLabel: string };
  /** Declarative, e.g. ['readTickets', 'createPullRequest']. */
  capabilities: string[];
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
