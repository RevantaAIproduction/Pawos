import type { CalendarProviderConnector, DocumentProviderConnector, MailboxProviderConnector } from '../../shared/office/OfficeTypes';

export type OfficeConnectorKind = 'documentProvider' | 'calendarProvider' | 'mailboxProvider';

type OfficeAdapterByKind = {
  documentProvider: DocumentProviderConnector;
  calendarProvider: CalendarProviderConnector;
  mailboxProvider: MailboxProviderConnector;
};

/**
 * Single facade over every registered Office Intelligence connector, keyed
 * by kind + id — direct sibling of InfrastructureConnectorRegistry.ts. Every
 * Office plugin asks this registry "give me the configured document
 * provider" / "list configured mailbox connectors," never imports a vendor
 * connector directly, so adding a new provider later never touches the
 * plugins that use it.
 */
class OfficeConnectorRegistry {
  private connectors: { [K in OfficeConnectorKind]: Map<string, OfficeAdapterByKind[K]> } = {
    documentProvider: new Map(),
    calendarProvider: new Map(),
    mailboxProvider: new Map(),
  };

  register<K extends OfficeConnectorKind>(kind: K, connector: OfficeAdapterByKind[K]): void {
    this.connectors[kind].set(connector.id, connector);
  }

  get<K extends OfficeConnectorKind>(kind: K, id: string): OfficeAdapterByKind[K] | undefined {
    return this.connectors[kind].get(id);
  }

  list<K extends OfficeConnectorKind>(kind: K): OfficeAdapterByKind[K][] {
    return [...this.connectors[kind].values()];
  }

  listConfigured<K extends OfficeConnectorKind>(kind: K): OfficeAdapterByKind[K][] {
    return this.list(kind).filter((c) => (c as { isConfigured(): boolean }).isConfigured());
  }

  firstConfigured<K extends OfficeConnectorKind>(kind: K): OfficeAdapterByKind[K] | undefined {
    return this.listConfigured(kind)[0];
  }
}

export const officeConnectorRegistry = new OfficeConnectorRegistry();
