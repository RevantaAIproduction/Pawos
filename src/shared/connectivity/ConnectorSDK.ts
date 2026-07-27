import type { ConnectorDefinition, ConnectorConnection, ConnectivityScope, ConnectorStatus, NormalizedConnectivityEvent } from './ConnectivityTypes';

/**
 * The abstract contract every connector adapter (GitHub, Jira, Slack, Docker,
 * SSH, AWS, Kubernetes, or anything after) must implement. The Connectivity
 * Runtime never knows anything about a specific connector beyond this
 * interface — every manager talks only through it.
 *
 * Platform lifecycle (see `ConnectorLifecycleState` in ConnectivityTypes.ts for the full state
 * machine and its transitions):
 *   Disconnected -> Connecting -> Connected -> Syncing -> Connected -> Expired -> Requires Re-auth -> Error
 *
 * Read vs. write is a hard boundary in this contract: `getStatus()` only ever reads whatever
 * `connect`/`authenticate`/`refresh`/`disconnect`/`sync` have already put in the connector's own
 * in-memory state — it is never itself a source of connect/auth/restore side effects. Restoring an
 * already-persisted credential into memory after an app restart goes through `authenticate()`
 * (called by `ConnectionManager.restore()`, an explicit, separate lifecycle step — see its doc
 * comment), never through `getStatus()`.
 *
 * When `definition.webhookRegistration === 'automatic'`, a connector's own
 * connect()/disconnect() implementation is responsible for calling that
 * provider's webhook-management API to create the webhook on connect and
 * remove it on disconnect — this is an implementation detail of that one
 * connector, never something the Runtime orchestrates. When
 * `webhookRegistration === 'manual'` (or absent), the Runtime does nothing
 * beyond generating the stable URL (see WebhookManager) — the Connections UI
 * is responsible for showing it.
 */
export interface ConnectorSDK {
  readonly definition: ConnectorDefinition;

  /**
   * `opts.incrementalCapabilities`, when present, asks the connector to request only the
   * scopes/permissions backing those specific capability names in addition to whatever it
   * already holds for this scope — never a full re-consent. Mapping a capability name to a
   * provider-specific scope is entirely the connector's own concern (e.g.
   * GoogleWorkspaceConnectorSDK's private CAPABILITY_TO_SCOPE table); OAuthManager and every
   * other Runtime manager only ever pass this array through, never interpret it. Connectors
   * with nothing incremental to offer (Jira, any apiToken connector) simply ignore `opts`.
   *
   * May begin an interactive OAuth/consent flow. Only ever called from an explicit user action
   * (a "Connect"/"Grant" click) — never from a mount effect, hydration, or startup.
   */
  connect(scope: ConnectivityScope, opts?: { incrementalCapabilities?: string[] }): Promise<ConnectorConnection>;
  disconnect(scope: ConnectivityScope): Promise<void>;

  authenticate(scope: ConnectivityScope, credential: unknown): Promise<void>;
  refresh(scope: ConnectivityScope): Promise<void>;
  validate(scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }>;

  health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }>;

  /**
   * Strictly read-only status discovery — the only method the Connections UI (or anything else
   * doing "is this connected?" discovery) is allowed to call on mount/repeated visits. Must never:
   * authenticate, open OAuth, create/verify a webhook, refresh a token, mutate a stored credential,
   * or restore runtime state from the vault. Reads only whatever is already sitting in the
   * connector's own in-memory field, populated by the last `connect`/`authenticate`/`refresh`/
   * `disconnect`/`sync` call. Returns `{ state: 'disconnected', capabilities: [] }` when nothing has
   * populated that field yet this process — it does not go looking for a reason to say otherwise.
   */
  getStatus(scope: ConnectivityScope): Promise<ConnectorStatus>;

  /**
   * The live, possibly-narrower-than-declared capability set (e.g. an OAuth
   * grant with fewer scopes than requested). CapabilityResolver reads this
   * instead of definition.capabilities directly, so the Runtime never has
   * to special-case a partial grant.
   */
  capabilities(): string[];

  subscribe(eventType: string, handler: (event: NormalizedConnectivityEvent) => void): () => void;
  unsubscribe(eventType: string): void;

  execute(action: string, params: Record<string, unknown>): Promise<unknown>;

  /** Optional, additive lifecycle members for connectors that support them — absent entirely for
   *  Jira/Google Workspace this pass; a future connector implements whichever apply to it without
   *  requiring any change to this interface or the Runtime managers that call it. */
  sync?(scope: ConnectivityScope): Promise<void>;
  registerWebhook?(scope: ConnectivityScope): Promise<void>;
  unregisterWebhook?(scope: ConnectivityScope): Promise<void>;
  verifyWebhook?(req: { headers: Record<string, string>; rawBody: string }): boolean;
  handleWebhook?(payload: unknown): Promise<void>;
}
