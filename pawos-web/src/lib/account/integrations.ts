import type { AccountContext } from "./accountContext";
import { CONNECTOR_REQUIRED_FEATURE, TIER_LABELS, lowestTierWithFeature, tierHasFeature } from "./entitlements";

/**
 * The Integrations page's data: which connectors PawOS supports, and the signed-in account's real
 * connection state for each.
 *
 * Web and Desktop share one connection store. State is read from connectivity_connections and
 * credentials live in connectivity_credentials (Supabase Vault-backed) — the same rows the desktop
 * app's ConnectionManagerService/ConnectivityCredentialService write. pawos-web never holds a
 * token: it reads connection status rows and, on disconnect, deletes the account's own rows.
 *
 * Only connectors the desktop app actually registers (src/main/main.ts) are listed. Microsoft
 * Teams and others that PawOS has no working connector for are deliberately absent.
 */

export type IntegrationGroup = "sourceControl" | "integrations" | "hosting";

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  group: IntegrationGroup;
}

export const INTEGRATION_GROUPS: { id: IntegrationGroup; title: string }[] = [
  { id: "sourceControl", title: "Source control" },
  { id: "integrations", title: "Integrations" },
  { id: "hosting", title: "Deployment" },
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  { id: "github", name: "GitHub", description: "Read repositories, issues, and pull requests from your GitHub account.", group: "sourceControl" },
  { id: "gitlab", name: "GitLab", description: "Read repositories, issues, and merge requests from your GitLab workspace.", group: "sourceControl" },
  { id: "bitbucket", name: "Bitbucket Cloud", description: "Read repositories and pull requests from your Bitbucket Cloud workspaces.", group: "sourceControl" },
  { id: "slack", name: "Slack", description: "Post messages and read channels in your Slack workspace.", group: "integrations" },
  { id: "linear", name: "Linear", description: "Read issues and projects from your Linear workspace.", group: "integrations" },
  { id: "jira", name: "Jira", description: "Read tickets, projects, and workflows from your Jira workspace.", group: "integrations" },
  { id: "vercel", name: "Vercel", description: "Deploy and check deployment status on your Vercel projects.", group: "hosting" },
  { id: "netlify", name: "Netlify", description: "Deploy and check deployment status on your Netlify sites.", group: "hosting" },
  { id: "railway", name: "Railway", description: "Deploy and check deployment status on your Railway projects.", group: "hosting" },
];

/**
 * How each connector's official MCP server is reached — mirrors `auth` in the desktop app's
 * src/shared/connectivity/McpProviders.ts (account.test.ts fails if the two disagree). MCP calls
 * themselves are made by the desktop app; the web only shows the state.
 *  - existingCredential: MCP uses this same connection, no second sign-in.
 *  - mcpSignIn: the provider's MCP server has its own sign-in, enabled from the desktop app.
 *  - providerSetup: the provider has to approve PawOS's app before MCP can be used.
 */
export type IntegrationMcpAccess = "existingCredential" | "mcpSignIn" | "providerSetup";

export const INTEGRATION_MCP_ACCESS: Record<string, IntegrationMcpAccess> = {
  linear: "existingCredential",
  github: "existingCredential",
  vercel: "existingCredential",
  railway: "existingCredential",
  gitlab: "mcpSignIn",
  jira: "mcpSignIn",
  bitbucket: "mcpSignIn",
  netlify: "mcpSignIn",
  slack: "providerSetup",
};

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id);
}

export type IntegrationConnectionState = "connected" | "needsReauth" | "error" | "notConnected";

export interface IntegrationState extends IntegrationDefinition {
  entitled: boolean;
  /** Set when not entitled: the lowest plan that includes this connector, e.g. "Paw Pro". */
  availableOn: string | null;
  connection: IntegrationConnectionState;
  /** The connected account/workspace name the connector recorded, when it recorded one. */
  accountLabel: string | null;
  connectedAt: string | null;
  /** How this connector's MCP server is reached, or null when the provider has none. */
  mcp: IntegrationMcpAccess | null;
}

export function isIntegrationEntitled(account: Pick<AccountContext, "tier">, connectorId: string): boolean {
  const feature = CONNECTOR_REQUIRED_FEATURE[connectorId];
  return Boolean(feature) && tierHasFeature(account.tier, feature);
}

type ConnectionRow = { connector_id: string; status: string; metadata: Record<string, unknown> | null; created_at: string | null };

function accountLabelOf(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  for (const key of ["organization", "accountName", "username", "teamName"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  }
  return null;
}

/**
 * Every supported connector with this account's entitlement and connection state. Reads the
 * account's personal connections (organization_id is null) — the scope the desktop app connects
 * under. RLS limits the query to the signed-in user's own rows regardless of the filter below.
 */
export async function listIntegrations(account: AccountContext): Promise<IntegrationState[]> {
  const { data, error } = await account.supabase
    .from("connectivity_connections")
    .select("connector_id, status, metadata, created_at")
    .eq("user_id", account.user.id)
    .is("organization_id", null);
  if (error) throw new Error("Could not load connection state.");

  const rows = new Map<string, ConnectionRow>();
  for (const row of (data ?? []) as ConnectionRow[]) rows.set(row.connector_id, row);

  return INTEGRATIONS.map((integration) => {
    const entitled = isIntegrationEntitled(account, integration.id);
    const row = rows.get(integration.id);
    // A connection stored under a higher tier stays stored but is inert once the account no longer
    // holds the feature — the same rule the desktop's connectivity:restore gate applies.
    const connection: IntegrationConnectionState =
      !row || !entitled || row.status === "disconnected"
        ? "notConnected"
        : row.status === "connected"
          ? "connected"
          : row.status === "needsReauth"
            ? "needsReauth"
            : "error";
    const requiredTier = lowestTierWithFeature(CONNECTOR_REQUIRED_FEATURE[integration.id]);
    return {
      ...integration,
      entitled,
      availableOn: entitled || !requiredTier ? null : TIER_LABELS[requiredTier],
      connection,
      accountLabel: connection === "notConnected" ? null : accountLabelOf(row?.metadata ?? null),
      connectedAt: connection === "notConnected" ? null : (row?.created_at ?? null),
      mcp: INTEGRATION_MCP_ACCESS[integration.id] ?? null,
    };
  });
}

/**
 * Removes the account's stored credential and connection for one connector. Always allowed for
 * the account's own rows — revoking access never needs an entitlement. The desktop app stops
 * using the connector the next time it restores connections.
 */
export async function disconnectIntegration(account: AccountContext, connectorId: string): Promise<void> {
  const credentials = await account.supabase
    .from("connectivity_credentials")
    .delete()
    .eq("user_id", account.user.id)
    .eq("connector_id", connectorId)
    .is("organization_id", null);
  if (credentials.error) throw new Error("Could not remove the stored credential.");

  const connections = await account.supabase
    .from("connectivity_connections")
    .delete()
    .eq("user_id", account.user.id)
    .eq("connector_id", connectorId)
    .is("organization_id", null);
  if (connections.error) throw new Error("Could not remove the connection.");
}
