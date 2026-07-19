import { memoryGraphStore, type Entity, type Inference } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';

/**
 * Infrastructure Awareness — the same generic Memory Graph every other
 * runtime writes into (see codingProjectEntities.ts/fileEntities.ts for the
 * established upsert-by-natural-key + supersede-before-relink precedent),
 * extended with the entity types an Infrastructure/DevOps/SRE runtime needs
 * to reason about relationships between what it operates: repositories,
 * services, deployments, databases, clusters, and domains. Nothing here is a
 * new store — it's typed wrappers over MemoryGraphStore, exactly like every
 * other *Entities.ts module.
 */

export type RepositoryAttributes = { fullName: string; provider: string; url: string; defaultBranch: string };
export type ServiceAttributes = { name: string; repositoryFullName?: string; framework?: string };
export type DeploymentAttributes = {
  deploymentId: string;
  provider: string;
  serviceName: string;
  url?: string;
  status: string;
  environment: 'production' | 'staging' | 'preview';
  deployedAt: number;
};
export type DatabaseAttributes = { name: string; engine: string; connectionRef?: string };
export type ClusterAttributes = { name: string; provider: string };
export type DomainAttributes = { hostname: string };
export type IncidentAttributes = { title: string; serviceName?: string; status: 'open' | 'investigating' | 'resolved'; rootCause?: string; openedAt: number; resolvedAt?: number };
export type OrganizationAttributes = { name: string; provider?: string };
export type ProjectAttributes = { name: string; organizationName?: string };
export type BranchAttributes = { repositoryFullName: string; name: string; isDefault: boolean };
export type ApiAttributes = { name: string; serviceName?: string; baseUrl?: string };
export type ContainerAttributes = { name: string; image: string; clusterName?: string };
export type KubernetesClusterAttributes = { name: string; provider: string };
export type LoadBalancerAttributes = { name: string; provider?: string };
/** Secret metadata only — key name and where it's stored, never the value. */
export type SecretAttributes = { name: string; serviceName?: string; storedIn?: string };
/** Same "name only, never value" discipline as ReadEnvVarsPlugin. */
export type EnvironmentVariableAttributes = { key: string; serviceName?: string };
export type StorageAttributes = { name: string; provider?: string; kind?: 's3' | 'blob' | 'disk' | 'other' };
export type QueueAttributes = { name: string; provider?: string };
export type CiCdPipelineAttributes = { name: string; repositoryFullName: string; provider: string };

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function findRepository(fullName: string): Entity | undefined {
  const target = normalize(fullName);
  return memoryGraphStore.queryEntities({ type: 'repository', where: (a) => normalize((a as RepositoryAttributes).fullName) === target })[0];
}

export function upsertRepository(attributes: RepositoryAttributes, inference?: Inference): Entity {
  const existing = findRepository(attributes.fullName);
  return memoryGraphStore.upsertEntity('repository', attributes, { id: existing?.id, inference, changeType: existing ? 'modified' : 'created' });
}

export function findService(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'service', where: (a) => normalize((a as ServiceAttributes).name) === target })[0];
}

/** Links a service to its repository — supersedes any prior link first, same discipline as fileEntities.ts's linkFileToWorkspace. */
export function upsertService(attributes: ServiceAttributes, inference?: Inference): Entity {
  const existing = findService(attributes.name);
  const entity = memoryGraphStore.upsertEntity('service', attributes, { id: existing?.id, inference, changeType: existing ? 'modified' : 'created' });
  if (attributes.repositoryFullName) {
    const repo = findRepository(attributes.repositoryFullName);
    if (repo) {
      for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
        if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.DEPLOYS_TO) memoryGraphStore.supersede(edge.id);
      }
      memoryGraphStore.link(entity.id, repo.id, RELATION.DEPLOYS_TO, {
        confidence: 1,
        evidence: [{ source: 'taskExecution', detail: `Service "${attributes.name}" is built from repository "${attributes.repositoryFullName}"` }],
        reasoningSummary: 'Linked from the repository name recorded at deploy time.',
      });
    }
  }
  return entity;
}

export function findLatestDeployment(serviceName: string): Entity | undefined {
  const target = normalize(serviceName);
  const deployments = memoryGraphStore.queryEntities({ type: 'deployment', where: (a) => normalize((a as DeploymentAttributes).serviceName) === target });
  return deployments.sort((a, b) => (b.attributes as DeploymentAttributes).deployedAt - (a.attributes as DeploymentAttributes).deployedAt)[0];
}

/** Every deployment is its own new entity (a history of deploys, not a single mutable record) — links RUNS_ON the service it deployed. */
export function recordDeployment(attributes: DeploymentAttributes, inference?: Inference): Entity {
  const entity = memoryGraphStore.upsertEntity('deployment', attributes, { inference, changeType: 'created' });
  const service = findService(attributes.serviceName);
  if (service) {
    memoryGraphStore.link(entity.id, service.id, RELATION.RUNS_ON, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `Deployment ${attributes.deploymentId} ran the "${attributes.serviceName}" service` }],
      reasoningSummary: 'Linked at the moment this deployment was recorded.',
    });
  }
  return entity;
}

export function findDatabase(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'database', where: (a) => normalize((a as DatabaseAttributes).name) === target })[0];
}

export function upsertDatabase(attributes: DatabaseAttributes, inference?: Inference): Entity {
  const existing = findDatabase(attributes.name);
  return memoryGraphStore.upsertEntity('database', attributes, { id: existing?.id, inference, changeType: existing ? 'modified' : 'created' });
}

/** Records that a service depends on a database — supersedes any prior DEPENDS_ON edge from this service to any database first. */
export function linkServiceToDatabase(serviceName: string, databaseName: string, inference?: Inference): void {
  const service = findService(serviceName);
  const database = findDatabase(databaseName);
  if (!service || !database) return;
  for (const edge of memoryGraphStore.getAllEdgesFor(service.id)) {
    if (edge.active && edge.fromId === service.id && edge.relation === RELATION.DEPENDS_ON) memoryGraphStore.supersede(edge.id);
  }
  memoryGraphStore.link(
    service.id,
    database.id,
    RELATION.DEPENDS_ON,
    inference ?? { confidence: 1, evidence: [{ source: 'taskExecution', detail: `"${serviceName}" reads/writes "${databaseName}"` }], reasoningSummary: 'Recorded directly, not inferred.' }
  );
}

export function findDomain(hostname: string): Entity | undefined {
  const target = normalize(hostname);
  return memoryGraphStore.queryEntities({ type: 'domain', where: (a) => normalize((a as DomainAttributes).hostname) === target })[0];
}

export function upsertDomain(attributes: DomainAttributes): Entity {
  const existing = findDomain(attributes.hostname);
  return memoryGraphStore.upsertEntity('domain', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Links a service to the domain it's exposed on — supersedes any prior EXPOSED_VIA edge from this service first. */
export function linkServiceToDomain(serviceName: string, hostname: string): void {
  const service = findService(serviceName);
  const domain = upsertDomain({ hostname });
  if (!service) return;
  for (const edge of memoryGraphStore.getAllEdgesFor(service.id)) {
    if (edge.active && edge.fromId === service.id && edge.relation === RELATION.EXPOSED_VIA) memoryGraphStore.supersede(edge.id);
  }
  memoryGraphStore.link(service.id, domain.id, RELATION.EXPOSED_VIA, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `"${serviceName}" is reachable at ${hostname}` }],
    reasoningSummary: 'Recorded directly from a real deployment/health-check URL.',
  });
}

export function findOpenIncidents(serviceName?: string): Entity[] {
  const target = serviceName ? normalize(serviceName) : undefined;
  return memoryGraphStore.queryEntities({
    type: 'incident',
    where: (a) => {
      const incident = a as IncidentAttributes;
      if (incident.status === 'resolved') return false;
      return !target || (incident.serviceName ? normalize(incident.serviceName) === target : false);
    },
  });
}

export function recordIncident(attributes: IncidentAttributes, inference?: Inference): Entity {
  const entity = memoryGraphStore.upsertEntity('incident', attributes, { inference, changeType: 'created' });
  if (attributes.serviceName) {
    const service = findService(attributes.serviceName);
    if (service) {
      memoryGraphStore.link(entity.id, service.id, RELATION.RELATES_TO, {
        confidence: 1,
        evidence: [{ source: 'taskExecution', detail: `Incident "${attributes.title}" investigated against the "${attributes.serviceName}" service` }],
        reasoningSummary: 'Linked at the moment this incident was recorded.',
      });
    }
  }
  return entity;
}

/** Real prior root causes on file for this service — feeds the Root Cause Engine's "have we seen this before" candidate. Never fabricated: only resolved incidents that actually had a rootCause recorded via resolveIncident(). */
export function findResolvedIncidentsWithRootCause(serviceName: string): { title: string; rootCause: string; resolvedAt?: number }[] {
  const target = normalize(serviceName);
  return memoryGraphStore
    .queryEntities({
      type: 'incident',
      where: (a) => {
        const inc = a as IncidentAttributes;
        return inc.status === 'resolved' && Boolean(inc.rootCause) && Boolean(inc.serviceName) && normalize(inc.serviceName as string) === target;
      },
    })
    .map((e) => e.attributes as IncidentAttributes)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
    .map((a) => ({ title: a.title, rootCause: a.rootCause as string, resolvedAt: a.resolvedAt }));
}

export function resolveIncident(incidentId: string, rootCause: string): Entity | undefined {
  const entity = memoryGraphStore.queryEntities({ type: 'incident' }).find((e) => e.id === incidentId);
  if (!entity) return undefined;
  const attrs = entity.attributes as IncidentAttributes;
  return memoryGraphStore.upsertEntity(
    'incident',
    { ...attrs, status: 'resolved', rootCause, resolvedAt: Date.now() },
    { id: entity.id, changeType: 'modified', changeDetail: 'Marked resolved with a recorded root cause.' }
  );
}

// ---- Universal Infrastructure Intelligence — the wider entity vocabulary
// (organizations/projects/branches/APIs/containers/clusters/load balancers/
// secrets & env var metadata/storage/queues/CI-CD pipelines) so Paw can
// reason across an entire infrastructure, not just repo->service->deploy.
// Same upsert-by-natural-key + supersede-before-relink discipline throughout.

export function findOrganization(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'organization', where: (a) => normalize((a as OrganizationAttributes).name) === target })[0];
}

export function upsertOrganization(attributes: OrganizationAttributes): Entity {
  const existing = findOrganization(attributes.name);
  return memoryGraphStore.upsertEntity('organization', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findProject(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'project', where: (a) => normalize((a as ProjectAttributes).name) === target })[0];
}

/** Links a project to its organization — supersedes any prior CONTAINS edge into this project first. */
export function upsertProject(attributes: ProjectAttributes): Entity {
  const existing = findProject(attributes.name);
  const entity = memoryGraphStore.upsertEntity('project', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
  if (attributes.organizationName) {
    const org = upsertOrganization({ name: attributes.organizationName });
    for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
      if (edge.active && edge.toId === entity.id && edge.relation === RELATION.CONTAINS) memoryGraphStore.supersede(edge.id);
    }
    memoryGraphStore.link(org.id, entity.id, RELATION.CONTAINS, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `Project "${attributes.name}" belongs to organization "${attributes.organizationName}"` }],
      reasoningSummary: 'Recorded directly, not inferred.',
    });
  }
  return entity;
}

export function findBranch(repositoryFullName: string, name: string): Entity | undefined {
  const targetRepo = normalize(repositoryFullName);
  const targetName = normalize(name);
  return memoryGraphStore.queryEntities({
    type: 'branch',
    where: (a) => {
      const b = a as BranchAttributes;
      return normalize(b.repositoryFullName) === targetRepo && normalize(b.name) === targetName;
    },
  })[0];
}

/** Links a branch to its repository — supersedes any prior BELONGS_TO edge from this branch first. */
export function upsertBranch(attributes: BranchAttributes): Entity {
  const existing = findBranch(attributes.repositoryFullName, attributes.name);
  const entity = memoryGraphStore.upsertEntity('branch', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
  const repo = findRepository(attributes.repositoryFullName);
  if (repo) {
    for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
      if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
    }
    memoryGraphStore.link(entity.id, repo.id, RELATION.BELONGS_TO, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `Branch "${attributes.name}" belongs to "${attributes.repositoryFullName}"` }],
      reasoningSummary: 'Recorded directly from source control data.',
    });
  }
  return entity;
}

export function findApi(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'api', where: (a) => normalize((a as ApiAttributes).name) === target })[0];
}

/** Links an API to the service that exposes it — supersedes any prior BELONGS_TO edge from this API first. */
export function upsertApi(attributes: ApiAttributes): Entity {
  const existing = findApi(attributes.name);
  const entity = memoryGraphStore.upsertEntity('api', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
  if (attributes.serviceName) {
    const service = findService(attributes.serviceName);
    if (service) {
      for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
        if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
      }
      memoryGraphStore.link(entity.id, service.id, RELATION.BELONGS_TO, {
        confidence: 1,
        evidence: [{ source: 'taskExecution', detail: `API "${attributes.name}" is exposed by service "${attributes.serviceName}"` }],
        reasoningSummary: 'Recorded directly, not inferred.',
      });
    }
  }
  return entity;
}

export function findKubernetesCluster(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'kubernetesCluster', where: (a) => normalize((a as KubernetesClusterAttributes).name) === target })[0];
}

export function upsertKubernetesCluster(attributes: KubernetesClusterAttributes): Entity {
  const existing = findKubernetesCluster(attributes.name);
  return memoryGraphStore.upsertEntity('kubernetesCluster', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findContainer(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'container', where: (a) => normalize((a as ContainerAttributes).name) === target })[0];
}

/** Links a container to the Kubernetes cluster it runs on — supersedes any prior RUNS_ON edge from this container first. */
export function upsertContainer(attributes: ContainerAttributes): Entity {
  const existing = findContainer(attributes.name);
  const entity = memoryGraphStore.upsertEntity('container', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
  if (attributes.clusterName) {
    const cluster = findKubernetesCluster(attributes.clusterName);
    if (cluster) {
      for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
        if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.RUNS_ON) memoryGraphStore.supersede(edge.id);
      }
      memoryGraphStore.link(entity.id, cluster.id, RELATION.RUNS_ON, {
        confidence: 1,
        evidence: [{ source: 'taskExecution', detail: `Container "${attributes.name}" runs on cluster "${attributes.clusterName}"` }],
        reasoningSummary: 'Recorded directly, not inferred.',
      });
    }
  }
  return entity;
}

export function findLoadBalancer(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'loadBalancer', where: (a) => normalize((a as LoadBalancerAttributes).name) === target })[0];
}

export function upsertLoadBalancer(attributes: LoadBalancerAttributes): Entity {
  const existing = findLoadBalancer(attributes.name);
  return memoryGraphStore.upsertEntity('loadBalancer', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Records that a load balancer routes to a service — supersedes any prior ROUTES_TO edge from this load balancer to any service first. */
export function linkLoadBalancerToService(loadBalancerName: string, serviceName: string): void {
  const lb = findLoadBalancer(loadBalancerName);
  const service = findService(serviceName);
  if (!lb || !service) return;
  for (const edge of memoryGraphStore.getAllEdgesFor(lb.id)) {
    if (edge.active && edge.fromId === lb.id && edge.relation === RELATION.ROUTES_TO) memoryGraphStore.supersede(edge.id);
  }
  memoryGraphStore.link(lb.id, service.id, RELATION.ROUTES_TO, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `Load balancer "${loadBalancerName}" routes to "${serviceName}"` }],
    reasoningSummary: 'Recorded directly, not inferred.',
  });
}

/** Metadata only (key name + where it lives) — never the secret's actual value, same discipline as ReadEnvVarsPlugin. */
export function recordSecretMetadata(attributes: SecretAttributes): Entity {
  const target = normalize(attributes.name);
  const existing = memoryGraphStore.queryEntities({
    type: 'secret',
    where: (a) => normalize((a as SecretAttributes).name) === target && (a as SecretAttributes).serviceName === attributes.serviceName,
  })[0];
  return memoryGraphStore.upsertEntity('secret', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Key name only — never the value, same discipline as ReadEnvVarsPlugin. */
export function recordEnvironmentVariableMetadata(attributes: EnvironmentVariableAttributes): Entity {
  const target = normalize(attributes.key);
  const existing = memoryGraphStore.queryEntities({
    type: 'environmentVariable',
    where: (a) => normalize((a as EnvironmentVariableAttributes).key) === target && (a as EnvironmentVariableAttributes).serviceName === attributes.serviceName,
  })[0];
  return memoryGraphStore.upsertEntity('environmentVariable', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findStorage(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'storage', where: (a) => normalize((a as StorageAttributes).name) === target })[0];
}

export function upsertStorage(attributes: StorageAttributes): Entity {
  const existing = findStorage(attributes.name);
  return memoryGraphStore.upsertEntity('storage', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findQueue(name: string): Entity | undefined {
  const target = normalize(name);
  return memoryGraphStore.queryEntities({ type: 'queue', where: (a) => normalize((a as QueueAttributes).name) === target })[0];
}

export function upsertQueue(attributes: QueueAttributes): Entity {
  const existing = findQueue(attributes.name);
  return memoryGraphStore.upsertEntity('queue', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Records that a service depends on a storage bucket/queue — supersedes any prior DEPENDS_ON edge of the same target type from this service first. */
export function linkServiceToResource(serviceName: string, resourceEntity: Entity): void {
  const service = findService(serviceName);
  if (!service) return;
  for (const edge of memoryGraphStore.getAllEdgesFor(service.id)) {
    if (edge.active && edge.fromId === service.id && edge.relation === RELATION.DEPENDS_ON && edge.toType === resourceEntity.type) memoryGraphStore.supersede(edge.id);
  }
  memoryGraphStore.link(service.id, resourceEntity.id, RELATION.DEPENDS_ON, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `"${serviceName}" depends on ${resourceEntity.type} "${JSON.stringify(resourceEntity.attributes).slice(0, 60)}"` }],
    reasoningSummary: 'Recorded directly, not inferred.',
  });
}

export function findCiCdPipeline(name: string, repositoryFullName: string): Entity | undefined {
  const targetName = normalize(name);
  const targetRepo = normalize(repositoryFullName);
  return memoryGraphStore.queryEntities({
    type: 'cicdPipeline',
    where: (a) => {
      const p = a as CiCdPipelineAttributes;
      return normalize(p.name) === targetName && normalize(p.repositoryFullName) === targetRepo;
    },
  })[0];
}

/** Links a CI/CD pipeline to its repository — supersedes any prior BELONGS_TO edge from this pipeline first. */
export function upsertCiCdPipeline(attributes: CiCdPipelineAttributes): Entity {
  const existing = findCiCdPipeline(attributes.name, attributes.repositoryFullName);
  const entity = memoryGraphStore.upsertEntity('cicdPipeline', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
  const repo = findRepository(attributes.repositoryFullName);
  if (repo) {
    for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
      if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
    }
    memoryGraphStore.link(entity.id, repo.id, RELATION.BELONGS_TO, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `Pipeline "${attributes.name}" runs against "${attributes.repositoryFullName}"` }],
      reasoningSummary: 'Recorded directly, not inferred.',
    });
  }
  return entity;
}
