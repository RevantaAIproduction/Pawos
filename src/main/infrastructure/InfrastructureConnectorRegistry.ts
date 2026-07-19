import type {
  CiCdConnector,
  CliDetectableConnector,
  HostingConnector,
  InfrastructureConnector,
  ProjectManagementConnector,
  SourceControlConnector,
} from '../../shared/infrastructure/InfrastructureTypes';

export type InfraConnectorKind = 'sourceControl' | 'projectManagement' | 'cicd' | 'hosting' | 'cloud' | 'container' | 'infrastructure';

type InfraAdapterByKind = {
  sourceControl: SourceControlConnector;
  projectManagement: ProjectManagementConnector;
  cicd: CiCdConnector;
  hosting: HostingConnector;
  cloud: CliDetectableConnector;
  container: CliDetectableConnector;
  infrastructure: InfrastructureConnector;
};

/**
 * Single facade over every registered infrastructure connector, keyed by
 * kind + id — direct sibling of CommunicationConnectorRegistry.ts. Every
 * plugin in the Infrastructure Runtime asks this registry "give me the
 * configured source control connector" / "list configured hosting
 * connectors," never imports a vendor connector directly, so adding a new
 * provider later never touches the plugins that use it.
 */
class InfrastructureConnectorRegistry {
  private connectors: { [K in InfraConnectorKind]: Map<string, InfraAdapterByKind[K]> } = {
    sourceControl: new Map(),
    projectManagement: new Map(),
    cicd: new Map(),
    hosting: new Map(),
    cloud: new Map(),
    container: new Map(),
    infrastructure: new Map(),
  };

  register<K extends InfraConnectorKind>(kind: K, connector: InfraAdapterByKind[K]): void {
    this.connectors[kind].set(connector.id, connector);
  }

  get<K extends InfraConnectorKind>(kind: K, id: string): InfraAdapterByKind[K] | undefined {
    return this.connectors[kind].get(id);
  }

  list<K extends InfraConnectorKind>(kind: K): InfraAdapterByKind[K][] {
    return [...this.connectors[kind].values()];
  }

  /** Every connector in `kind` that reports itself as configured right now (isConfigured-style kinds only). */
  listConfigured<K extends 'sourceControl' | 'projectManagement' | 'cicd' | 'hosting' | 'infrastructure'>(
    kind: K
  ): InfraAdapterByKind[K][] {
    return this.list(kind).filter((c) => (c as { isConfigured(): boolean }).isConfigured());
  }

  /** The first configured connector in `kind`, if any — used when a plugin just needs "whichever one is set up," not a specific id. */
  firstConfigured<K extends 'sourceControl' | 'projectManagement' | 'cicd' | 'hosting' | 'infrastructure'>(
    kind: K
  ): InfraAdapterByKind[K] | undefined {
    return this.listConfigured(kind)[0];
  }
}

export const infrastructureConnectorRegistry = new InfrastructureConnectorRegistry();
