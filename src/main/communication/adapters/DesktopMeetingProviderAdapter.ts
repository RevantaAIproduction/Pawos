import type { MeetingEvent, MeetingProviderAdapter, MeetingProviderCapability } from '../../../shared/communication/CommunicationTypes';
import { findWindowsForProcess, type DetectedWindow } from './ProcessWindowDetector';

/**
 * Real, generic desktop meeting-provider detection — the concrete answer to
 * "never hardcode Zoom logic" (architecture doc §12.1): this adapter never
 * touches audio, its only job is "is a meeting from this provider active,
 * and what's it called." Built once as a factory over real process/window-
 * title detection (ProcessWindowDetector.ts, same safe execFile pattern as
 * ForegroundWindowWatcher.ts) so adding Webex or any future desktop-app
 * provider is one config entry, not new code.
 *
 * Honest about what this CAN'T do without a vendor SDK/API: real per-
 * participant join/leave events, camera/mic/screen-share status, and
 * calendar links aren't exposed by watching a window title, so those
 * capabilities are simply absent from `capabilities` rather than faked —
 * same discipline as BrowserAdapter's NOT_IMPLEMENTED precedent. Only
 * `detectActiveMeeting` and `meetingMetadata` (the title, best-effort) are
 * declared, and only those are ever called.
 */
function makeProcessBasedAdapter(config: { id: string; displayName: string; processNames: string[]; titleFilter?: (title: string) => boolean }): MeetingProviderAdapter {
  const capabilities = new Set<MeetingProviderCapability>(['detectActiveMeeting', 'meetingMetadata']);
  let subscribers: ((event: MeetingEvent) => void)[] = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let activeMeetingId: string | null = null;
  let activeTitle: string | null = null;

  async function scan(): Promise<DetectedWindow[]> {
    const results = await Promise.all(config.processNames.map((name) => findWindowsForProcess(name)));
    const windows = results.flat();
    return config.titleFilter ? windows.filter((w) => config.titleFilter!(w.title)) : windows;
  }

  async function pollOnce(): Promise<void> {
    const windows = await scan();
    const found = windows[0] ?? null;
    if (found && !activeMeetingId) {
      activeMeetingId = `${config.id}-${found.processId}-${Date.now()}`;
      activeTitle = found.title;
      const startedAt = Date.now();
      subscribers.forEach((cb) => cb({ type: 'started', meetingId: activeMeetingId!, title: activeTitle!, startedAt }));
    } else if (!found && activeMeetingId) {
      const meetingId = activeMeetingId;
      activeMeetingId = null;
      activeTitle = null;
      subscribers.forEach((cb) => cb({ type: 'ended', meetingId, endedAt: Date.now() }));
    } else if (found && activeMeetingId) {
      activeTitle = found.title;
    }
  }

  return {
    id: config.id,
    displayName: config.displayName,
    capabilities,

    async detect(): Promise<boolean> {
      const windows = await scan();
      return windows.length > 0;
    },

    async getActiveMeeting(): Promise<{ meetingId: string; title: string } | null> {
      if (activeMeetingId && activeTitle) return { meetingId: activeMeetingId, title: activeTitle };
      const windows = await scan();
      const found = windows[0];
      return found ? { meetingId: `${config.id}-${found.processId}`, title: found.title } : null;
    },

    async getParticipants(): Promise<string[]> {
      // Honest limitation: real participant enumeration needs the
      // provider's own SDK/API, which this generic window-detection
      // adapter doesn't have. Empty, not fabricated.
      return [];
    },

    subscribe(onEvent: (event: MeetingEvent) => void): () => void {
      subscribers.push(onEvent);
      if (!pollTimer) pollTimer = setInterval(() => void pollOnce(), 4000);
      return () => {
        subscribers = subscribers.filter((cb) => cb !== onEvent);
        if (subscribers.length === 0 && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
    },
  };
}

export const zoomAdapter = makeProcessBasedAdapter({
  id: 'zoom',
  displayName: 'Zoom',
  processNames: ['Zoom', 'CptHost'], // CptHost = Zoom's actual in-meeting window process on Windows
});

export const teamsAdapter = makeProcessBasedAdapter({
  id: 'teams',
  displayName: 'Microsoft Teams',
  processNames: ['Teams', 'ms-teams'],
});

export const webexAdapter = makeProcessBasedAdapter({
  id: 'webex',
  displayName: 'Webex',
  processNames: ['CiscoCollabHost', 'atmgr'],
});

// Google Meet runs in a browser tab, not a standalone app — detected via
// the SAME window-title mechanism against known browser processes, filtered
// to titles that look like a Meet call. This is a best-effort heuristic,
// not a guarantee (a user could rename a tab, or Meet could change its
// title convention) — declared honestly with the same limited capability
// set as the process-based adapters above.
export const googleMeetAdapter = makeProcessBasedAdapter({
  id: 'googleMeet',
  displayName: 'Google Meet',
  processNames: ['chrome', 'msedge', 'brave'],
  titleFilter: (title) => /meet\.google\.com|Google Meet/i.test(title),
});
