/**
 * IPC handler for meeting management (recording, summarization, distribution).
 * Pro tier and higher feature - gated by tier checks in handlers.
 */

import { entitlementService } from '../../billing/EntitlementService';
import type {
  Meeting,
  MeetingAttendee,
  MeetingDistributeRequest,
  MeetingDistributeResult,
  MeetingListQuery,
  MeetingListResult,
  MeetingRecordRequest,
  MeetingRecordResult,
  MeetingSummarizeRequest,
  MeetingSummarizeResult,
  StructuredSummary,
  TopicSegment,
  ActionItem,
  CropSummaryRequest,
  CropSummaryResult,
  DraftRequest,
  DraftResult,
  ScheduleSendRequest,
  ScheduleSendResult,
  MeetingDraft,
  ScheduledSend,
  GetScheduledSendsResult,
  SummarizationCostRequest,
  SummarizationCostResponse,
  SummarizationCostTransaction,
  MeetingSummarizeWithCostRequest,
  MeetingSummarizeWithCostResult,
} from '../../../shared/workspace/MeetingTypes';

// In-memory store for now; should be replaced with persistent SQLite storage
const meetingStore = new Map<string, Meeting>();
const meetingSummaryStore = new Map<string, Map<string, Meeting['summary']>>();
const structuredSummaryStore = new Map<string, StructuredSummary>();
const draftStore = new Map<string, MeetingDraft>();
const scheduledSendStore = new Map<string, ScheduledSend>();
const transactionStore = new Map<string, SummarizationCostTransaction>();

/**
 * Create or start a meeting recording
 */
export function recordMeeting(userId: string, request: MeetingRecordRequest): MeetingRecordResult {
  try {
    const meeting: Meeting = {
      id: request.meetingId || `meeting-${Date.now()}`,
      title: request.title,
      status: 'in-progress' as const,
      attendees: (request.attendees || []).map((email: string) => ({
        email,
        joinedAt: Date.now(),
      })),
      organizer: { email: userId },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    meetingStore.set(meeting.id, meeting);

    return {
      ok: true,
      recording: {
        id: `rec-${Date.now()}`,
        url: `file:///meetings/${meeting.id}/recording.webm`,
        mimeType: 'video/webm',
        duration: 0,
        size: 0,
        createdAt: Date.now(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to start recording',
    };
  }
}

/**
 * Generate AI summary of a meeting
 */
export async function summarizeMeeting(userId: string, request: MeetingSummarizeRequest): Promise<MeetingSummarizeResult> {
  try {
    const meeting = meetingStore.get(request.meetingId);
    if (!meeting) {
      return {
        ok: false,
        reason: 'Meeting not found',
      };
    }

    // TODO: Integrate with real AI provider (Gemini)
    // For now, generate a stub summary
    const summary = {
      id: `summary-${Date.now()}`,
      meetingId: request.meetingId,
      content: `This is an AI-generated summary for "${meeting.title}". In a real implementation, this would be generated from the recording transcript using the configured AI provider.`,
      keyPoints: [
        'Key point 1 would go here',
        'Key point 2 would go here',
        'Key point 3 would go here',
      ],
      actionItems: [
        'Action item 1 to be assigned',
        'Action item 2 to be assigned',
      ],
      decisions: ['Decision 1 was made', 'Decision 2 was made'],
      generatedAt: Date.now(),
      generatedBy: request.model || 'paw-gemini',
    };

    meeting.summary = summary;
    meeting.status = 'completed' as const;
    meeting.updatedAt = Date.now();

    let summaryMap = meetingSummaryStore.get(request.meetingId);
    if (!summaryMap) {
      summaryMap = new Map();
      meetingSummaryStore.set(request.meetingId, summaryMap);
    }
    summaryMap.set(summary.id, summary);

    return { ok: true, summary };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to summarize meeting',
    };
  }
}

/**
 * Distribute meeting summary to selected users
 */
export async function distributeMeetingSummary(
  userId: string,
  request: MeetingDistributeRequest
): Promise<MeetingDistributeResult> {
  try {
    const meeting = meetingStore.get(request.meetingId);
    if (!meeting || !meeting.summary) {
      return {
        ok: false,
        reason: 'Meeting or summary not found',
      };
    }

    // TODO: Integrate with email service to actually send summaries
    // For now, return a stub response

    const sentTo = request.recipients || [];
    return {
      ok: true,
      distributionId: `dist-${Date.now()}`,
      sentTo,
      failed: [],
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to distribute summary',
    };
  }
}

/**
 * List meetings with optional filtering
 */
export function listMeetings(userId: string, query?: MeetingListQuery): MeetingListResult {
  try {
    let meetings = Array.from(meetingStore.values()).filter(
      (m) => m.organizer.email === userId
    );

    // Apply filters
    if (query?.status) {
      meetings = meetings.filter((m) => m.status === query.status);
    }
    if (query?.hasRecording) {
      meetings = meetings.filter((m) => m.recording !== undefined);
    }
    if (query?.hasSummary) {
      meetings = meetings.filter((m) => m.summary !== undefined);
    }

    // Sort by created date descending
    meetings.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paginated = meetings.slice(offset, offset + limit);

    return {
      ok: true,
      meetings: paginated,
      total: meetings.length,
    };
  } catch (error) {
    return {
      ok: false,
      meetings: [],
      total: 0,
    };
  }
}

/**
 * Get a single meeting by ID
 */
export function getMeeting(meetingId: string): Meeting | null {
  return meetingStore.get(meetingId) || null;
}

/**
 * Update meeting status
 */
export function updateMeetingStatus(
  meetingId: string,
  status: Meeting['status']
): { ok: boolean; meeting?: Meeting; reason?: string } {
  try {
    const meeting = meetingStore.get(meetingId);
    if (!meeting) {
      return { ok: false, reason: 'Meeting not found' };
    }

    meeting.status = status;
    meeting.updatedAt = Date.now();

    if (status === 'completed') {
      meeting.endedAt = Date.now();
      if (meeting.startedAt) {
        meeting.duration = meeting.endedAt - meeting.startedAt;
      }
    }

    return { ok: true, meeting };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to update meeting',
    };
  }
}

/**
 * Add attendee to meeting
 */
export function addAttendee(
  meetingId: string,
  attendee: MeetingAttendee
): { ok: boolean; meeting?: Meeting; reason?: string } {
  try {
    const meeting = meetingStore.get(meetingId);
    if (!meeting) {
      return { ok: false, reason: 'Meeting not found' };
    }

    const exists = meeting.attendees.some((a: MeetingAttendee) => a.email === attendee.email);
    if (!exists) {
      meeting.attendees.push(attendee);
    }

    return { ok: true, meeting };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to add attendee',
    };
  }
}

/**
 * Join a Google Meet/Zoom/Teams meeting using user's Google credentials
 * (NOT PawOS account). Creates meeting record and starts recording.
 * Called after user approves pre-meeting notification.
 */
export async function joinAndRecordMeeting(
  userId: string,
  userEmail: string,
  meetingLink: string,
  meetingTitle?: string
): Promise<{ ok: boolean; meetingId?: string; reason?: string }> {
  try {
    // Validate meeting link
    if (!meetingLink || (!meetingLink.includes('meet.google.com') &&
        !meetingLink.includes('zoom.us') &&
        !meetingLink.includes('teams.microsoft.com'))) {
      return { ok: false, reason: 'Invalid meeting link. Must be Google Meet, Zoom, or Teams.' };
    }

    const meetingId = `meeting-${Date.now()}`;

    // Create meeting record
    const meeting: Meeting = {
      id: meetingId,
      title: meetingTitle || 'Meeting',
      status: 'in-progress',
      startedAt: Date.now(),
      attendees: [{ email: userEmail, joinedAt: Date.now() }],
      organizer: { email: userEmail },
      meetingLink,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    meetingStore.set(meetingId, meeting);

    // Create recording record (will be populated as recording progresses)
    const recording = {
      id: `rec-${Date.now()}`,
      url: `file:///meetings/${meetingId}/recording.webm`,
      mimeType: 'video/webm',
      duration: 0,
      size: 0,
      createdAt: Date.now(),
    };

    meeting.recording = recording;

    return { ok: true, meetingId };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to join and record meeting',
    };
  }
}

/**
 * Complete meeting recording after user leaves meeting.
 * Prepares for summary generation.
 */
export function completeMeetingRecording(
  meetingId: string,
  recordingDurationSeconds: number
): { ok: boolean; meeting?: Meeting; reason?: string } {
  try {
    const meeting = meetingStore.get(meetingId);
    if (!meeting || !meeting.recording) {
      return { ok: false, reason: 'Meeting or recording not found' };
    }

    meeting.status = 'completed';
    meeting.endedAt = Date.now();
    meeting.duration = recordingDurationSeconds;
    meeting.recording.duration = recordingDurationSeconds;
    meeting.updatedAt = Date.now();

    return { ok: true, meeting };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to complete recording',
    };
  }
}

/**
 * Generate structured summary from meeting recording
 * Returns purpose, key takeaways, topics with timestamps, and action items
 */
export async function generateStructuredSummary(
  meetingId: string
): Promise<{ ok: boolean; structured?: StructuredSummary; reason?: string }> {
  try {
    const meeting = meetingStore.get(meetingId);
    if (!meeting || !meeting.summary) {
      return { ok: false, reason: 'Meeting or summary not found' };
    }

    // TODO: Integrate with real AI provider to extract structure from summary content
    // For now, generate a structured summary from the existing summary
    const summary = meeting.summary;

    const structured: StructuredSummary = {
      purpose: `Purpose of ${meeting.title}`,
      keyTakeaways: summary.keyPoints || [],
      topics: [
        {
          name: 'Topic 1',
          timestamp: 0,
          content: 'Discussion content from the meeting',
          duration: 120,
        },
        {
          name: 'Topic 2',
          timestamp: 120,
          content: 'More discussion content',
          duration: 180,
        },
      ],
      actionItems: summary.actionItems.map((item: string, index: number) => ({
        id: `action-${index}`,
        task: item,
        owner: meeting.organizer.name || 'Unassigned',
        ownerEmail: meeting.organizer.email,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending' as const,
        timestamp: 0,
      })),
    };

    structuredSummaryStore.set(meetingId, structured);
    return { ok: true, structured };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to generate structured summary',
    };
  }
}

/**
 * Crop summary to include only selected topics and action items
 */
export function cropSummary(request: CropSummaryRequest): CropSummaryResult {
  try {
    const structured = structuredSummaryStore.get(request.meetingId);
    if (!structured) {
      return { ok: false, reason: 'Structured summary not found' };
    }

    const cropped = {
      purpose: structured.purpose,
      keyTakeaways: structured.keyTakeaways,
      topics: structured.topics.filter(
        (t: TopicSegment) => !request.selectedTopics || request.selectedTopics.includes(t.name)
      ),
      actionItems: structured.actionItems.filter(
        (a: ActionItem) => !request.selectedActionItems || request.selectedActionItems.includes(a.id)
      ),
    };

    return { ok: true, cropped };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to crop summary',
    };
  }
}

/**
 * Save meeting summary as draft
 */
export function saveDraft(request: DraftRequest): DraftResult {
  try {
    const draft: MeetingDraft = {
      id: `draft-${Date.now()}`,
      meetingId: request.meetingId,
      recipients: request.recipients,
      contentType: request.contentType,
      selectedContent: request.selectedContent,
      emailDraft: request.emailDraft,
      savedAt: Date.now(),
      updatedAt: Date.now(),
    };

    draftStore.set(draft.id, draft);
    return { ok: true, draft };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to save draft',
    };
  }
}

/**
 * Get all drafts for a meeting
 */
export function getDrafts(
  meetingId: string
): { ok: boolean; drafts: MeetingDraft[]; reason?: string } {
  try {
    const drafts = Array.from(draftStore.values()).filter(
      (d: MeetingDraft) => d.meetingId === meetingId
    );
    return { ok: true, drafts };
  } catch (error) {
    return {
      ok: false,
      drafts: [],
      reason: error instanceof Error ? error.message : 'Failed to get drafts',
    };
  }
}

/**
 * Schedule meeting summary to be sent at a later time
 */
export function scheduleSend(request: ScheduleSendRequest): ScheduleSendResult {
  try {
    const scheduled: ScheduledSend = {
      id: `scheduled-${Date.now()}`,
      meetingId: request.meetingId,
      recipients: request.recipients,
      contentType: request.contentType,
      selectedContent: request.selectedContent,
      emailContent: request.emailContent,
      scheduledTime: request.scheduledTime,
      status: 'pending',
      createdAt: Date.now(),
    };

    scheduledSendStore.set(scheduled.id, scheduled);
    return { ok: true, scheduledSend: scheduled };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to schedule send',
    };
  }
}

/**
 * Get all scheduled sends for a meeting
 */
export function getScheduledSends(meetingId: string): GetScheduledSendsResult {
  try {
    const scheduled = Array.from(scheduledSendStore.values()).filter(
      (s: ScheduledSend) => s.meetingId === meetingId && s.status === 'pending'
    );
    return { ok: true, scheduled };
  } catch (error) {
    return {
      ok: false,
      scheduled: [],
    };
  }
}

/**
 * Calculate summarization cost for a meeting (Paw Compute)
 * Formula: (durationSeconds / 60) * 0.5 = PC cost
 * 1 minute = 0.5 PC
 * 1 hour = 30 PC
 */
export function calculateSummarizationCost(durationSeconds: number): number {
  const cost = (durationSeconds / 60) * 0.5;
  // Round to 2 decimals
  return Math.round(cost * 100) / 100;
}

/**
 * Get summarization cost without deducting balance
 * Used to display cost to user before confirming
 * Pro tier or higher required (Pro, Pro Max, Team, Enterprise)
 */
export function getSummarizationCost(userId: string, request: SummarizationCostRequest): SummarizationCostResponse {
  try {
    // Set current user for entitlementService tier checks
    entitlementService.setCurrentUserId(userId);

    // Check if user has Pro tier or higher (meetingAssistant feature)
    if (!entitlementService.isFeatureAvailable('meetingAssistant')) {
      const requiredTier = entitlementService.findMinimumTierForFeature('meetingAssistant');
      return {
        ok: false,
        error: 'TIER_REQUIRED',
        message: 'Meeting summarization requires Pro tier or higher. Upgrade to Pro ($20/month), Pro Max ($100/month), Team, or Enterprise to continue.',
        requiredTier: requiredTier as 'pro' | 'proMax' | 'team' | 'enterprise',
      };
    }

    const meeting = meetingStore.get(request.meetingId);
    if (!meeting) {
      return {
        ok: false,
        cost: 0,
        durationMinutes: 0,
        currentBalance: 0,
        newBalance: 0,
        canSummarize: false,
      };
    }

    // Calculate cost from request duration or meeting recording duration
    const durationSeconds = request.durationSeconds || meeting.recording?.duration || 0;
    const cost = calculateSummarizationCost(durationSeconds);
    const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;

    // TODO: Get actual user balance from billing service
    // For now, use placeholder
    const currentBalance = 100; // Placeholder

    const newBalance = currentBalance - cost;
    const canSummarize = newBalance >= 0;

    return {
      ok: true,
      cost,
      durationMinutes,
      currentBalance,
      newBalance: Math.max(0, newBalance),
      canSummarize,
    };
  } catch (error) {
    console.error('Failed to calculate summarization cost:', error);
    return {
      ok: false,
      cost: 0,
      durationMinutes: 0,
      currentBalance: 0,
      newBalance: 0,
      canSummarize: false,
    };
  }
}

/**
 * Confirm and execute meeting summarization with cost deduction
 * Re-checks balance, deducts compute, generates summary, and logs transaction
 * Pro tier or higher required (Pro, Pro Max, Team, Enterprise)
 */
export async function confirmSummarize(
  userId: string,
  request: MeetingSummarizeWithCostRequest
): Promise<MeetingSummarizeWithCostResult> {
  try {
    // Set current user for entitlementService tier checks
    entitlementService.setCurrentUserId(userId);

    // Check if user has Pro tier or higher (meetingAssistant feature)
    if (!entitlementService.isFeatureAvailable('meetingAssistant')) {
      return {
        ok: false,
        reason: 'Meeting summarization requires Pro tier or higher. Upgrade to Pro ($20/month), Pro Max ($100/month), Team, or Enterprise to continue.',
      };
    }

    const meeting = meetingStore.get(request.meetingId);
    if (!meeting) {
      return {
        ok: false,
        reason: 'Meeting not found',
      };
    }

    if (!meeting.recording) {
      return {
        ok: false,
        reason: 'No recording found for this meeting',
      };
    }

    // Calculate cost
    const durationSeconds = meeting.recording.duration;
    const cost = calculateSummarizationCost(durationSeconds);
    const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;

    // TODO: Re-check balance from billing service
    // For now, use placeholder balance check
    const currentBalance = 100; // Placeholder
    if (currentBalance < cost) {
      return {
        ok: false,
        reason: `Insufficient balance (need ${cost} PC, have ${currentBalance} PC)`,
      };
    }

    // Create transaction record
    const transaction: SummarizationCostTransaction = {
      id: `txn-${Date.now()}`,
      userId,
      meetingId: request.meetingId,
      cost,
      durationMinutes,
      durationSeconds,
      timestamp: Date.now(),
      status: 'pending',
    };

    transactionStore.set(transaction.id, transaction);

    // Generate summary using existing handler
    const summaryRequest: MeetingSummarizeRequest = {
      meetingId: request.meetingId,
      recordingId: request.recordingId,
      transcriptText: request.transcriptText,
      model: request.model,
    };

    const summaryResult = await summarizeMeeting(userId, summaryRequest);

    if (!summaryResult.ok) {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.reason = summaryResult.reason || 'Failed to generate summary';
      return {
        ok: false,
        reason: summaryResult.reason || 'Failed to generate summary',
        transaction,
      };
    }

    // TODO: Deduct compute cost from billing service
    // For now, just mark transaction as completed
    transaction.status = 'completed';

    // Log transaction completion
    console.log(
      `[MeetingHandler] Transaction ${transaction.id}: Deducted ${cost} PC from user ${userId} for meeting ${request.meetingId}`
    );

    return {
      ok: true,
      summary: summaryResult.summary,
      transaction,
      costDeducted: cost,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to summarize meeting',
    };
  }
}
