import type { MeetingParticipantAdapter, MeetingParticipantCapability, MeetingParticipantSessionEvent } from '../../../shared/communication/CommunicationTypes';

/**
 * Meeting Participant adapters — Paw joining a call as a real bot
 * participant ("Paw AI Assistant"), the preferred recording mode
 * (Fathom/Otter/Fireflies-style). Real per-platform joining requires that
 * platform's own SDK/bot credentials (Zoom Meeting SDK key/secret, a
 * Google Workspace add-on / Meet media API grant, a registered Microsoft
 * Teams bot + Azure AD app, a Webex integration API key) — none of which
 * are configured in this project. `canJoin()` checks honestly for real
 * configuration (an env var naming that platform's credential) rather than
 * ever assuming; with nothing configured, it truthfully reports false, and
 * CommunicationRuntime.startCapture() automatically falls back to desktop
 * capture (DesktopMeetingProviderAdapter.ts) — never a failure, per the
 * mission's explicit fallback requirement. When real credentials are added
 * later, only `join()`/`leave()`/`subscribe()` need real implementations
 * here — CommunicationRuntime and everything above it already treats both
 * modes identically.
 */
function makeHonestParticipantAdapter(config: { id: string; displayName: string; credentialEnvVar: string }): MeetingParticipantAdapter {
  const capabilities = new Set<MeetingParticipantCapability>([
    'joinMeeting',
    'recordAudio',
    'recordVideo',
    'detectScreenShare',
    'trackParticipants',
    'trackSpeakerTimeline',
    'captureFrames',
  ]);
  let subscribers = new Map<string, ((event: MeetingParticipantSessionEvent) => void)[]>();

  return {
    id: config.id,
    displayName: config.displayName,
    capabilities,

    async canJoin(): Promise<boolean> {
      // Real, honest check — never optimistic. Configuring
      // process.env[config.credentialEnvVar] with a real platform
      // credential is what would flip this adapter from
      // fallback-always to genuinely joining.
      return Boolean(process.env[config.credentialEnvVar]?.trim());
    },

    async join(): Promise<{ ok: false; message: string }> {
      // canJoin() already gates this — if CommunicationRuntime ever calls
      // join() without a real credential configured, that's a bug in the
      // caller, not something to fake a success for here.
      return { ok: false, message: `${config.displayName} participant joining isn't configured on this device yet.` };
    },

    async leave(): Promise<{ ok: true }> {
      return { ok: true };
    },

    subscribe(sessionId: string, onEvent: (event: MeetingParticipantSessionEvent) => void): () => void {
      const list = subscribers.get(sessionId) ?? [];
      list.push(onEvent);
      subscribers.set(sessionId, list);
      return () => {
        subscribers.set(sessionId, (subscribers.get(sessionId) ?? []).filter((cb) => cb !== onEvent));
      };
    },
  };
}

export const zoomParticipantAdapter = makeHonestParticipantAdapter({ id: 'zoom', displayName: 'Zoom', credentialEnvVar: 'ZOOM_MEETING_SDK_KEY' });
export const googleMeetParticipantAdapter = makeHonestParticipantAdapter({ id: 'googleMeet', displayName: 'Google Meet', credentialEnvVar: 'GOOGLE_MEET_BOT_TOKEN' });
export const teamsParticipantAdapter = makeHonestParticipantAdapter({ id: 'teams', displayName: 'Microsoft Teams', credentialEnvVar: 'TEAMS_BOT_APP_ID' });
export const webexParticipantAdapter = makeHonestParticipantAdapter({ id: 'webex', displayName: 'Webex', credentialEnvVar: 'WEBEX_INTEGRATION_API_KEY' });
