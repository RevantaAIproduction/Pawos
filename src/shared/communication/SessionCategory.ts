import type { CommunicationSourceDescriptor, SessionTimelineEntryKind } from './CommunicationTypes';

export type SessionCategory = 'virtualMeeting' | 'phoneCall' | 'faceToFace';

/**
 * Registry-driven, not a hardcoded medium list — stays correct as new
 * mediums are registered later (CommunicationSourceRegistry.ts).
 */
export function getSessionCategory(requiresAdapter: CommunicationSourceDescriptor['requiresAdapter'] | undefined): SessionCategory {
  if (requiresAdapter === 'phoneCall') return 'phoneCall';
  if (requiresAdapter === 'meetingProvider') return 'virtualMeeting';
  return 'faceToFace';
}

export const SESSION_CATEGORY_LABELS: Record<SessionCategory, string> = {
  virtualMeeting: 'Virtual Meeting',
  phoneCall: 'Phone Call',
  faceToFace: 'In-Person',
};

export const SESSION_TIMELINE_KIND_LABELS: Record<SessionTimelineEntryKind, string> = {
  transcriptSegment: 'Transcript',
  speakerChange: 'Speaker Change',
  actionItem: 'Action Item',
  decision: 'Decision',
  followUp: 'Follow-up',
  signal: 'Signal',
  visualEvidence: 'Visual Evidence',
};
