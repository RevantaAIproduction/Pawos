import type {
  CalendarAdapter,
  CrmAdapter,
  MailAdapter,
  MeetingParticipantAdapter,
  MeetingProviderAdapter,
  MessagingAdapter,
  PhoneCallAdapter,
} from '../../shared/communication/CommunicationTypes';

export type ConnectorKind = 'meetingProvider' | 'meetingParticipant' | 'phoneCall' | 'messaging' | 'mail' | 'crm' | 'calendar';

type AdapterByKind = {
  meetingProvider: MeetingProviderAdapter;
  meetingParticipant: MeetingParticipantAdapter;
  phoneCall: PhoneCallAdapter;
  messaging: MessagingAdapter;
  mail: MailAdapter;
  crm: CrmAdapter;
  calendar: CalendarAdapter;
};

/**
 * Single facade over every configured adapter, keyed by kind + id — direct
 * sibling of how DesktopExecutionEngine registers plugins. The Intelligence
 * Layer's Sync Planner and Capture Layer's ingest path ask this registry
 * "give me the active CRM adapter" / "give me the meeting provider adapter
 * for zoom," never import a vendor adapter directly (architecture doc §12.6).
 */
class CommunicationConnectorRegistry {
  private adapters: { [K in ConnectorKind]: Map<string, AdapterByKind[K]> } = {
    meetingProvider: new Map(),
    meetingParticipant: new Map(),
    phoneCall: new Map(),
    messaging: new Map(),
    mail: new Map(),
    crm: new Map(),
    calendar: new Map(),
  };

  register<K extends ConnectorKind>(kind: K, adapter: AdapterByKind[K]): void {
    this.adapters[kind].set(adapter.id, adapter);
  }

  get<K extends ConnectorKind>(kind: K, id: string): AdapterByKind[K] | undefined {
    return this.adapters[kind].get(id);
  }

  list<K extends ConnectorKind>(kind: K): AdapterByKind[K][] {
    return [...this.adapters[kind].values()];
  }

  /** Every meeting-provider adapter that reports itself as actually detectable right now — used by Capture Layer to know which provider (if any) to tag a new desktop recording with. */
  async listActiveMeetingProviders(): Promise<MeetingProviderAdapter[]> {
    const all = this.list('meetingProvider');
    const flags = await Promise.all(all.map((a) => a.detect().catch(() => false)));
    return all.filter((_, i) => flags[i]);
  }
}

export const communicationConnectorRegistry = new CommunicationConnectorRegistry();
