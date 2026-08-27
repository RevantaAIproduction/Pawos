/**
 * Credential Resolver for Autonomous Orchestrator
 * Fetches GitHub, Jira, Linear API credentials from the connectivity vault via IPC.
 */

import { getIpcBridge } from '../services/ipc/ipcBridge';
import { getSupabaseClient } from '../auth/supabaseClient';

export type ResolvedCredentials = {
  github?: { token: string };
  jira?: { url: string; email: string; apiToken: string };
  linear?: { apiKey: string };
};

/**
 * Resolves credentials from the credential vault for the given organization and current user.
 * Uses IPC to query the connectivity credential vault in the main process.
 * Returns only the credentials that are available (others are undefined).
 */
export async function resolveCredentialsForOrganization(
  organizationId: string
): Promise<ResolvedCredentials> {
  try {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      throw new Error('No authenticated user found');
    }

    const bridge = getIpcBridge();
    const result: ResolvedCredentials = {};

    // Resolve GitHub credentials
    const githubResult = await bridge.connectivityGetStoredCredential('github', { userId, organizationId: organizationId || undefined });
    if (githubResult.ok && githubResult.data?.secret) {
      result.github = { token: githubResult.data.secret };
    }

    // Resolve Jira credentials (access token + derived metadata like cloudId, siteUrl)
    const jiraResult = await bridge.connectivityGetStoredCredential('jira', { userId, organizationId: organizationId || undefined });
    if (jiraResult.ok && jiraResult.data?.secret) {
      // Also fetch Jira metadata (cloudId, siteUrl) which was stored during OAuth connection
      const jiraMetaResult = await bridge.connectivityGetJiraMetadata({ userId, organizationId: organizationId || undefined });

      if (jiraMetaResult.ok && jiraMetaResult.data?.cloudId) {
        result.jira = {
          url: `https://api.atlassian.com/ex/jira/${jiraMetaResult.data.cloudId}`,
          email: 'api@jira', // Jira Cloud OAuth doesn't need email, token is sufficient
          apiToken: jiraResult.data.secret,
        };
      }
    }

    // Resolve Linear credentials
    const linearResult = await bridge.connectivityGetStoredCredential('linear', { userId, organizationId: organizationId || undefined });
    if (linearResult.ok && linearResult.data?.secret) {
      result.linear = { apiKey: linearResult.data.secret };
    }

    return result;
  } catch (error) {
    console.error('Failed to resolve credentials:', error);
    return {};
  }
}

/**
 * Checks if a given credential type is available for an organization.
 */
export async function hasCredential(organizationId: string, type: 'github' | 'jira' | 'linear'): Promise<boolean> {
  const credentials = await resolveCredentialsForOrganization(organizationId);

  switch (type) {
    case 'github':
      return !!credentials.github;
    case 'jira':
      return !!credentials.jira;
    case 'linear':
      return !!credentials.linear;
    default:
      return false;
  }
}
