import type { ConnectorDefinition, ConnectorConnection, ConnectivityScope, NormalizedConnectivityEvent } from './ConnectivityTypes';

/**
 * The abstract contract every connector adapter (GitHub, Jira, Slack, Docker,
 * SSH, AWS, Kubernetes, or anything after) must implement. The Connectivity
 * Runtime never knows anything about a specific connector beyond this
 * interface — every manager talks only through it.
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

  connect(scope: ConnectivityScope): Promise<ConnectorConnection>;
  disconnect(scope: ConnectivityScope): Promise<void>;

  authenticate(scope: ConnectivityScope, credential: unknown): Promise<void>;
  refresh(scope: ConnectivityScope): Promise<void>;
  validate(scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }>;

  health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }>;

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
}
