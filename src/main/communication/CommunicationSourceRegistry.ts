import type { CommunicationSourceDescriptor } from '../../shared/communication/CommunicationTypes';

/**
 * The one place a new communication source is ever introduced (architecture
 * doc §4). Adding Telegram/SMS/LinkedIn/etc. later means calling `register`
 * once with a descriptor and, if it needs one, implementing an adapter
 * interface — never touching Capture Layer, Storage Layer, the Unified
 * Timeline, or the UI, all of which only ever ask this registry "what kind
 * of source is this," never hardcode a source list themselves.
 */
class CommunicationSourceRegistry {
  private sources = new Map<string, CommunicationSourceDescriptor>();

  register(descriptor: CommunicationSourceDescriptor): void {
    this.sources.set(descriptor.id, descriptor);
  }

  get(id: string): CommunicationSourceDescriptor | undefined {
    return this.sources.get(id);
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }

  list(): CommunicationSourceDescriptor[] {
    return [...this.sources.values()];
  }
}

export const communicationSourceRegistry = new CommunicationSourceRegistry();

// Current, implemented sources (mission "Communication Sources — Current").
communicationSourceRegistry.register({ id: 'faceToFace', displayName: 'Face-to-face meeting', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: null });
communicationSourceRegistry.register({ id: 'phoneCall', displayName: 'Phone call', channelKind: 'audio', capturedVia: 'mobileAudio', requiresAdapter: 'phoneCall' });
communicationSourceRegistry.register({ id: 'voiceNote', displayName: 'Voice note', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: null });
communicationSourceRegistry.register({ id: 'googleMeet', displayName: 'Google Meet', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'zoom', displayName: 'Zoom', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'teams', displayName: 'Microsoft Teams', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'webex', displayName: 'Webex', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });

// Future-ready — registered now so the schema/timeline/search never need to
// change when a real adapter for one of these ships; each is honestly
// unimplemented until a matching adapter exists (mission "Future-ready
// adapter interfaces").
communicationSourceRegistry.register({ id: 'slackHuddle', displayName: 'Slack Huddle', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'discord', displayName: 'Discord', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'whatsappCall', displayName: 'WhatsApp Call', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'telegramCall', displayName: 'Telegram Call', channelKind: 'audio', capturedVia: 'desktopAudio', requiresAdapter: 'meetingProvider' });
communicationSourceRegistry.register({ id: 'email', displayName: 'Email', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'mail' });
communicationSourceRegistry.register({ id: 'sms', displayName: 'SMS', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'linkedin', displayName: 'LinkedIn Messages', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'instagram', displayName: 'Instagram Messages', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'messenger', displayName: 'Facebook Messenger', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'x', displayName: 'X Messages', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'whatsapp', displayName: 'WhatsApp', channelKind: 'mixed', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'telegram', displayName: 'Telegram', channelKind: 'mixed', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
communicationSourceRegistry.register({ id: 'slack', displayName: 'Slack (DMs/channels)', channelKind: 'text', capturedVia: 'adapterIngest', requiresAdapter: 'messaging' });
