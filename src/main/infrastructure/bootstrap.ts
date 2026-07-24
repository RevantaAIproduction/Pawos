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
import { RailwayConnector } from './connectors/hosting/RailwayConnector';
import { GoogleCloudRunConnector } from './connectors/hosting/GoogleCloudRunConnector';
import { AwsElasticBeanstalkConnector } from './connectors/hosting/AwsElasticBeanstalkConnector';
import { DockerVpsConnector } from './connectors/hosting/DockerVpsConnector';
import { HostingerConnector } from './connectors/hosting/HostingerConnector';
import { GitHubPagesConnector } from './connectors/hosting/GitHubPagesConnector';
import { AwsEc2Connector } from './connectors/hosting/AwsEc2Connector';
import { GoogleComputeEngineConnector } from './connectors/hosting/GoogleComputeEngineConnector';
import { AzureVmConnector } from './connectors/hosting/AzureVmConnector';
import { DigitalOceanConnector } from './connectors/hosting/DigitalOceanConnector';
import { LinodeConnector } from './connectors/hosting/LinodeConnector';
import { VultrConnector } from './connectors/hosting/VultrConnector';
import { HetznerConnector } from './connectors/hosting/HetznerConnector';
import { OracleCloudConnector } from './connectors/hosting/OracleCloudConnector';
import { HostingerVpsConnector } from './connectors/hosting/HostingerVpsConnector';
import { KubernetesConnector } from './connectors/hosting/KubernetesConnector';
import { AzureAppServiceConnector } from './connectors/hosting/AzureAppServiceConnector';
import { RenderConnector } from './connectors/hosting/RenderConnector';
import { FlyIoConnector } from './connectors/hosting/FlyIoConnector';
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
  infrastructureConnectorRegistry.register('hosting', new RailwayConnector(envVars.RAILWAY_TOKEN, envVars.RAILWAY_PROJECT_ID, envVars.RAILWAY_SERVICE_ID));
  infrastructureConnectorRegistry.register('hosting', new GoogleCloudRunConnector(envVars.GCP_CLOUD_RUN_SERVICE, envVars.GCP_PROJECT_ID, envVars.GCP_REGION || 'us-central1'));
  infrastructureConnectorRegistry.register('hosting', new AwsElasticBeanstalkConnector(envVars.AWS_EB_APPLICATION, envVars.AWS_EB_ENVIRONMENT, envVars.AWS_EB_S3_BUCKET, envVars.AWS_EB_REGION || 'us-east-1'));
  infrastructureConnectorRegistry.register('hosting', new DockerVpsConnector(envVars.DEPLOY_SSH_HOST, envVars.DEPLOY_IMAGE_NAME, envVars.DEPLOY_CONTAINER_NAME, envVars.DEPLOY_PORT_MAPPING || '80:80'));
  infrastructureConnectorRegistry.register('hosting', new HostingerConnector(envVars.HOSTINGER_SFTP_HOST, envVars.HOSTINGER_SFTP_USER, envVars.HOSTINGER_REMOTE_PATH, envVars.HOSTINGER_SFTP_PORT || '22', envVars.HOSTINGER_SITE_URL));
  infrastructureConnectorRegistry.register('hosting', new GitHubPagesConnector(envVars.GITHUB_TOKEN, envVars.GITHUB_PAGES_REPO, envVars.GITHUB_PAGES_BRANCH || 'gh-pages'));

  infrastructureConnectorRegistry.register('hosting', new AwsEc2Connector(
    envVars.AWS_EC2_AMI_ID, envVars.AWS_EC2_INSTANCE_TYPE || 't3.micro', envVars.AWS_EC2_KEY_NAME,
    envVars.AWS_EC2_SECURITY_GROUP_ID, envVars.AWS_EC2_SUBNET_ID, envVars.AWS_EC2_REGION || 'us-east-1',
    envVars.AWS_EC2_IMAGE_NAME, envVars.AWS_EC2_CONTAINER_NAME, envVars.AWS_EC2_PORT_MAPPING || '80:80', envVars.AWS_EC2_SSH_USER || 'ubuntu'
  ));
  infrastructureConnectorRegistry.register('hosting', new GoogleComputeEngineConnector(
    envVars.GCE_INSTANCE_NAME, envVars.GCP_PROJECT_ID, envVars.GCE_ZONE || 'us-central1-a',
    envVars.GCE_MACHINE_TYPE || 'e2-medium', envVars.GCE_IMAGE_FAMILY || 'ubuntu-2204-lts', envVars.GCE_IMAGE_PROJECT || 'ubuntu-os-cloud',
    envVars.GCE_IMAGE_NAME, envVars.GCE_CONTAINER_NAME, envVars.GCE_PORT_MAPPING || '80:80', ...(envVars.GCE_SSH_USER ? [envVars.GCE_SSH_USER] : [])
  ));
  infrastructureConnectorRegistry.register('hosting', new AzureVmConnector(
    envVars.AZURE_VM_NAME, envVars.AZURE_RESOURCE_GROUP, envVars.AZURE_VM_LOCATION || 'eastus',
    envVars.AZURE_VM_SIZE || 'Standard_B2s', envVars.AZURE_VM_IMAGE || 'Ubuntu2204',
    envVars.AZURE_VM_IMAGE_NAME, envVars.AZURE_VM_CONTAINER_NAME, envVars.AZURE_VM_PORT_MAPPING || '80:80', envVars.AZURE_VM_SSH_USER || 'azureuser'
  ));
  infrastructureConnectorRegistry.register('hosting', new DigitalOceanConnector(
    envVars.DIGITALOCEAN_DROPLET_NAME, envVars.DIGITALOCEAN_SSH_KEY_ID, envVars.DIGITALOCEAN_REGION || 'nyc3',
    envVars.DIGITALOCEAN_SIZE || 's-1vcpu-1gb', envVars.DIGITALOCEAN_IMAGE || 'ubuntu-22-04-x64',
    envVars.DIGITALOCEAN_IMAGE_NAME, envVars.DIGITALOCEAN_CONTAINER_NAME, envVars.DIGITALOCEAN_PORT_MAPPING || '80:80', envVars.DIGITALOCEAN_SSH_USER || 'root'
  ));
  infrastructureConnectorRegistry.register('hosting', new LinodeConnector(
    envVars.LINODE_LABEL, envVars.LINODE_REGION || 'us-east', envVars.LINODE_TYPE || 'g6-nanode-1', envVars.LINODE_IMAGE || 'linode/ubuntu22.04',
    envVars.LINODE_IMAGE_NAME, envVars.LINODE_CONTAINER_NAME, envVars.LINODE_PORT_MAPPING || '80:80', envVars.LINODE_SSH_USER || 'root'
  ));
  infrastructureConnectorRegistry.register('hosting', new VultrConnector(
    envVars.VULTR_HOSTNAME, envVars.VULTR_SSH_KEY_ID, envVars.VULTR_REGION || 'ewr', envVars.VULTR_PLAN || 'vc2-1c-1gb', envVars.VULTR_OS_ID || '1743',
    envVars.VULTR_IMAGE_NAME, envVars.VULTR_CONTAINER_NAME, envVars.VULTR_PORT_MAPPING || '80:80', envVars.VULTR_SSH_USER || 'root'
  ));
  infrastructureConnectorRegistry.register('hosting', new HetznerConnector(
    envVars.HETZNER_SERVER_NAME, envVars.HETZNER_SSH_KEY_NAME, envVars.HETZNER_LOCATION || 'nbg1', envVars.HETZNER_SERVER_TYPE || 'cx22', envVars.HETZNER_IMAGE || 'ubuntu-22.04',
    envVars.HETZNER_IMAGE_NAME, envVars.HETZNER_CONTAINER_NAME, envVars.HETZNER_PORT_MAPPING || '80:80', envVars.HETZNER_SSH_USER || 'root'
  ));
  infrastructureConnectorRegistry.register('hosting', new OracleCloudConnector(
    envVars.OCI_INSTANCE_NAME, envVars.OCI_AVAILABILITY_DOMAIN, envVars.OCI_COMPARTMENT_ID, envVars.OCI_SUBNET_ID, envVars.OCI_IMAGE_ID, envVars.OCI_SHAPE || 'VM.Standard.E2.1.Micro',
    envVars.OCI_IMAGE_NAME, envVars.OCI_CONTAINER_NAME, envVars.OCI_PORT_MAPPING || '80:80', envVars.OCI_SSH_USER || 'opc'
  ));
  infrastructureConnectorRegistry.register('hosting', new HostingerVpsConnector(
    envVars.HOSTINGER_API_TOKEN, envVars.HOSTINGER_VPS_ID,
    envVars.HOSTINGER_VPS_IMAGE_NAME, envVars.HOSTINGER_VPS_CONTAINER_NAME, envVars.HOSTINGER_VPS_PORT_MAPPING || '80:80', envVars.HOSTINGER_VPS_SSH_USER || 'root'
  ));

  infrastructureConnectorRegistry.register('hosting', new KubernetesConnector(envVars.KUBERNETES_MANIFEST_PATH, envVars.KUBERNETES_DEPLOYMENT_NAME, envVars.KUBERNETES_NAMESPACE || 'default', envVars.KUBERNETES_SERVICE_NAME));
  infrastructureConnectorRegistry.register('hosting', new AzureAppServiceConnector(
    envVars.AZURE_APP_SERVICE_NAME, envVars.AZURE_APP_SERVICE_RESOURCE_GROUP, envVars.AZURE_APP_SERVICE_LOCATION || 'eastus',
    envVars.AZURE_APP_SERVICE_PLAN_SKU || 'B1', envVars.AZURE_APP_SERVICE_RUNTIME || 'NODE|20-lts', envVars.AZURE_APP_SERVICE_STAGING_SLOT
  ));
  infrastructureConnectorRegistry.register('hosting', new RenderConnector(envVars.RENDER_API_KEY, envVars.RENDER_SERVICE_ID));
  infrastructureConnectorRegistry.register('hosting', new FlyIoConnector(envVars.FLYIO_APP_NAME));

  infrastructureConnectorRegistry.register('cloud', new AwsCliConnector());
  infrastructureConnectorRegistry.register('cloud', new GcpCliConnector());
  infrastructureConnectorRegistry.register('cloud', new AzureCliConnector());
  infrastructureConnectorRegistry.register('container', new DockerCliConnector());
  infrastructureConnectorRegistry.register('container', new KubernetesCliConnector());
}
