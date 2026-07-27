import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { JiraConnector } from '../../infrastructure/connectors/projectManagement/JiraConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';

export interface JiraCredentialFields {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export function isJiraCredentialFields(value: unknown): value is JiraCredentialFields {
  const v = value as Partial<JiraCredentialFields> | null | undefined;
  return typeof v?.baseUrl === 'string' && typeof v?.email === 'string' && typeof v?.apiToken === 'string';
}

async function checkJiraCredential(fields: JiraCredentialFields): Promise<{ valid: boolean; reason?: string }> {
  try {
    const basic = Buffer.from(`${fields.email}:${fields.apiToken}`).toString('base64');
    const res = await fetch(`${fields.baseUrl.replace(/\/+$/, '')}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
    });
    if (res.ok) return { valid: true };
    return { valid: false, reason: `Jira rejected these credentials (HTTP ${res.status}).` };
  } catch (error) {
    return { valid: false, reason: `Couldn't reach Jira: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * PawOS's first real ConnectorSDK — bridges the Connectivity Runtime's capability resolution
 * (previously connector-less) into the Infrastructure Runtime, which is what
 * InvestigateTicketPlugin and every other infra plugin actually call. `authenticate()` validates
 * the credential live against Jira, then registers/replaces the live JiraConnector instance in
 * `infrastructureConnectorRegistry` — the same registry InvestigateTicketPlugin already reads from
 * today, so nothing else needs to change for it to start working.
 *
 * Phase 3 scope: in-memory only, for the current process lifetime. Restart durability (persisting
 * the credential to the Vault or a Guest-mode local store) is Phase 4, not this file.
 */
export class JiraConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'jira',
    displayName: 'Jira',
    description: 'Read tickets and project data from your Jira workspace.',
    category: 'projectManagement' as const,
    authMethod: 'apiToken' as const,
    apiTokenHelp: {
      instructionsUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
      fieldLabel: 'API token',
      additionalFields: [
        { name: 'baseUrl', label: 'Jira site URL (e.g. https://yourteam.atlassian.net)', type: 'text' as const },
        { name: 'email', label: 'Email', type: 'text' as const },
      ],
    },
    capabilities: ['readTickets'],
    capabilityDescriptors: [
      { id: 'readTickets', label: 'Read tickets', description: 'Fetch or search Jira tickets and their fields.' },
    ],
  };

  private credential: JiraCredentialFields | undefined;
  /** Populated only by authenticate()/connect()/disconnect()/refresh() — getStatus() only ever
   *  reads this field, never derives or fetches it itself. */
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    const c = this.credential;
    infrastructureConnectorRegistry.register('projectManagement', new JiraConnector(c?.baseUrl, c?.email, c?.apiToken));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    if (!isJiraCredentialFields(credential)) {
      throw new Error('Jira credential must include baseUrl, email, and apiToken.');
    }
    const result = await checkJiraCredential(credential);
    if (!result.valid) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: result.reason ?? 'Jira credential validation failed.' };
      throw new Error(result.reason ?? 'Jira credential validation failed.');
    }
    this.credential = credential;
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString() };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    if (!this.credential) {
      throw new Error('JiraConnectorSDK.connect() requires authenticate() to have succeeded first.');
    }
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString() };
    return {
      id: `jira:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: {},
    };
  }

  async disconnect(_scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    // No unregister() exists on InfrastructureConnectorRegistry (deliberately not added this
    // pass) — replacing the live connector with an unconfigured instance is an honest, equivalent
    // way to report "not connected" without widening that registry's API.
    infrastructureConnectorRegistry.register('projectManagement', new JiraConnector(undefined, undefined, undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(_scope: ConnectivityScope): Promise<void> {
    // apiToken auth has no refresh-token concept — re-validate the credential already on file.
    if (!this.credential) return;
    const result = await checkJiraCredential(this.credential);
    if (!result.valid) {
      this.credential = undefined;
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
    }
  }

  /** Strictly read-only — see ConnectorSDK.getStatus's contract. Never validates live, never
   *  touches a store; only reflects whatever the last connect/authenticate/disconnect/refresh call
   *  already put in currentStatus. */
  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Jira is not connected.' };
    return checkJiraCredential(this.credential);
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy' } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    // Jira webhooks are out of scope this pass (definition declares no `events`) — no-op.
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.credential) throw new Error('Jira is not connected.');
    const connector = new JiraConnector(this.credential.baseUrl, this.credential.email, this.credential.apiToken);
    if (action === 'getTicket') return connector.getTicket(String(params.ticketId));
    if (action === 'searchTickets') return connector.searchTickets(String(params.query));
    throw new Error(`JiraConnectorSDK does not support action "${action}".`);
  }
}

/** One instance shared by connectorRegistry, the connect/persist plugins, and startup
 *  reconnection — every caller must reference the same instance since it holds the in-memory
 *  credential state. */
export const jiraConnectorSDK = new JiraConnectorSDK();
