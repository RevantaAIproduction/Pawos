import { infrastructureConnectorRegistry } from './InfrastructureConnectorRegistry';
import { GitHubSourceControlConnector } from './connectors/sourceControl/GitHubSourceControlConnector';
import { GitLabSourceControlConnector } from './connectors/sourceControl/GitLabSourceControlConnector';
import { GitHubIssuesConnector } from './connectors/projectManagement/GitHubIssuesConnector';
import { LinearConnector } from './connectors/projectManagement/LinearConnector';
import { JiraConnector } from './connectors/projectManagement/JiraConnector';
import { GitHubActionsConnector } from './connectors/cicd/GitHubActionsConnector';
import { GitLabCiConnector } from './connectors/cicd/GitLabCiConnector';
import { VercelConnector } from './connectors/hosting/VercelConnector';
import { NetlifyConnector } from './connectors/hosting/NetlifyConnector';
import { AwsCliConnector, AzureCliConnector, DockerCliConnector, GcpCliConnector, KubernetesCliConnector } from './connectors/cli/CliDetectConnectors';

/**
 * Constructs and registers every Infrastructure Runtime connector from the
 * app's own env vars (see .env.example) — called once at startup from
 * main.ts, same lifecycle position as other *Store.init() calls. Every
 * connector is registered unconditionally (even with an empty token); each
 * one's own isConfigured()/detect() is what decides whether Paw treats it as
 * usable, so adding a real token later needs no code change or restart of
 * this function's shape, only a real app restart to re-read .env.
 */
export function initInfrastructureConnectors(envVars: Record<string, string>): void {
  const gitlabUrl = envVars.GITLAB_URL || 'https://gitlab.com';

  infrastructureConnectorRegistry.register('sourceControl', new GitHubSourceControlConnector(envVars.GITHUB_TOKEN));
  infrastructureConnectorRegistry.register('sourceControl', new GitLabSourceControlConnector(envVars.GITLAB_TOKEN, gitlabUrl));

  infrastructureConnectorRegistry.register('projectManagement', new GitHubIssuesConnector(envVars.GITHUB_TOKEN));
  infrastructureConnectorRegistry.register('projectManagement', new LinearConnector(envVars.LINEAR_API_KEY));
  infrastructureConnectorRegistry.register('projectManagement', new JiraConnector(envVars.JIRA_BASE_URL, envVars.JIRA_EMAIL, envVars.JIRA_API_TOKEN));

  infrastructureConnectorRegistry.register('cicd', new GitHubActionsConnector(envVars.GITHUB_TOKEN));
  infrastructureConnectorRegistry.register('cicd', new GitLabCiConnector(envVars.GITLAB_TOKEN, gitlabUrl));

  infrastructureConnectorRegistry.register('hosting', new VercelConnector(envVars.VERCEL_TOKEN));
  infrastructureConnectorRegistry.register('hosting', new NetlifyConnector(envVars.NETLIFY_TOKEN, envVars.NETLIFY_SITE_ID));

  infrastructureConnectorRegistry.register('cloud', new AwsCliConnector());
  infrastructureConnectorRegistry.register('cloud', new GcpCliConnector());
  infrastructureConnectorRegistry.register('cloud', new AzureCliConnector());
  infrastructureConnectorRegistry.register('container', new DockerCliConnector());
  infrastructureConnectorRegistry.register('container', new KubernetesCliConnector());
}
