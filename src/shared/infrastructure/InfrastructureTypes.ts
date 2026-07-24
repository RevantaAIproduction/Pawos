/**
 * Shared types for the Infrastructure/DevOps/SRE Runtime — a connector-based
 * layer so Paw can host, deploy, investigate, and operate real infrastructure
 * without the user (or the model) ever needing to name a specific cloud
 * provider, hosting platform, CI/CD system, or ticketing tool. Mirrors the
 * Communication Runtime's ConnectorKind/adapter-by-kind pattern
 * (CommunicationConnectorRegistry.ts) — one small interface per connector
 * kind, real implementations register themselves, and an honest "not
 * configured" result is always possible instead of a fabricated one.
 */

export type SourceControlProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azureRepos' | 'internalGit';
export type ProjectManagementProviderId = 'jira' | 'linear' | 'githubIssues' | 'azureBoards' | 'youtrack' | 'redmine';
export type CloudProviderId = 'gcp' | 'aws' | 'azure' | 'oracle' | 'digitalocean' | 'hetzner' | 'vultr' | 'linode';
export type HostingProviderId =
  | 'hostinger'
  | 'vercel'
  | 'netlify'
  | 'railway'
  | 'render'
  | 'flyio'
  | 'cloudflare'
  | 'firebaseHosting'
  | 'githubPages'
  | 'googleCloudRun'
  | 'awsElasticBeanstalk'
  | 'dockerVps'
  | 'awsEc2'
  | 'googleComputeEngine'
  | 'azureVm'
  | 'digitalOcean'
  | 'linode'
  | 'vultr'
  | 'hetzner'
  | 'oracleCloud'
  | 'hostingerVps'
  | 'kubernetes'
  | 'azureAppService';
export type ContainerProviderId = 'docker' | 'dockerCompose' | 'kubernetes' | 'openshift' | 'rancher';
export type CiCdProviderId =
  | 'githubActions'
  | 'gitlabCi'
  | 'azurePipelines'
  | 'jenkins'
  | 'circleci'
  | 'bamboo'
  | 'teamcity'
  | 'selfHosted';
export type DatabaseProviderId =
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'mongodb'
  | 'redis'
  | 'sqlite'
  | 'supabase'
  | 'planetscale'
  | 'neon';
export type InfrastructureProviderId = 'ssh' | 'vpn' | 'onPrem' | 'privateKubernetes' | 'reverseProxy' | 'dns' | 'ssl' | 'secretManager';

/** Common result shape every connector method returns — never throws, never fabricates a success. */
export type ConnectorResult<T> = { ok: true } & T | { ok: false; reason: string };

export type InfraTicket = {
  id: string;
  title: string;
  description: string;
  url?: string;
  status?: string;
  labels?: string[];
};

export type InfraRepository = { name: string; fullName: string; defaultBranch: string; url: string };
export type InfraCommit = { sha: string; message: string; author: string; date: string };
export type InfraPullRequest = {
  number: number;
  title: string;
  author: string;
  headBranch: string;
  baseBranch: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
};
export type InfraCiCdRun = {
  status: 'success' | 'failure' | 'running' | 'pending' | 'cancelled' | 'unknown';
  url?: string;
  startedAt?: string;
  completedAt?: string;
};
export type InfraDeployment = { deploymentId: string; url: string; status: string; createdAt: string };

export interface SourceControlConnector {
  readonly id: SourceControlProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  listRepositories(): Promise<ConnectorResult<{ repos: InfraRepository[] }>>;
  getFileContent(repo: string, path: string, ref?: string): Promise<ConnectorResult<{ content: string }>>;
  getLatestCommit(repo: string, branch?: string): Promise<ConnectorResult<InfraCommit>>;
  listPullRequests(repo: string): Promise<ConnectorResult<{ pullRequests: InfraPullRequest[] }>>;
  getPullRequestDiff(repo: string, prNumber: number): Promise<ConnectorResult<{ diff: string }>>;
  createPullRequestComment(repo: string, prNumber: number, body: string): Promise<ConnectorResult<{ commentUrl?: string }>>;
}

export interface ProjectManagementConnector {
  readonly id: ProjectManagementProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  getTicket(ticketId: string): Promise<ConnectorResult<{ ticket: InfraTicket }>>;
  searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>>;
}

export interface CiCdConnector {
  readonly id: CiCdProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  getLatestRunStatus(repo: string, branch?: string): Promise<ConnectorResult<InfraCiCdRun>>;
}

export interface HostingConnector {
  readonly id: HostingProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>>;
  getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>>;
  rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>>;
  /** Promotes an already-built deployment (e.g. a staging/preview one) to production without a new build, when the provider supports it. */
  promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>>;
}

/**
 * Cloud/container connectors are deliberately thin — real operation happens
 * through the user's own installed, authenticated CLI (aws/gcloud/az/docker/
 * kubectl) via RunCommandPlugin, exactly like RunDeployScriptPlugin never
 * invents deployment infrastructure. These connectors only answer "is this
 * CLI installed and authenticated right now" so Paw can decide whether the
 * relevant action is even possible before attempting it.
 */
export interface CliDetectableConnector {
  readonly id: CloudProviderId | ContainerProviderId;
  readonly displayName: string;
  detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }>;
}

export interface InfrastructureConnector {
  readonly id: InfrastructureProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
}
