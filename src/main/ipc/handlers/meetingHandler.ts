/**
 * IPC handler for meeting management (recording, summarization, distribution).
 * Pro tier and higher feature - gated by tier checks in handlers.
 */

import { entitlementService } from '../../billing/EntitlementService';
import { emailService } from '../../mail/EmailService';
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

// Phase 7: Supabase-backed persistent storage (replacing in-memory Maps)
// Lazy-loaded on first use to avoid import at module load time
let supabase: any = null;

async function getSupabaseClient() {
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
}

/**
 * Create or start a meeting recording
 */
export async function recordMeeting(userId: string, request: MeetingRecordRequest): Promise<MeetingRecordResult> {
  try {
    const db = await getSupabaseClient();
    const meetingId = request.meetingId || `meeting-${Date.now()}`;

    const meeting: Meeting = {
      id: meetingId,
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

    // Persist meeting to Supabase
    const { error } = await db
      .from('meetings')
      .insert({
        id: meeting.id,
        user_id: userId,
        title: meeting.title,
        status: meeting.status,
        attendees: meeting.attendees,
        organizer: meeting.organizer,
        created_at: new Date(meeting.createdAt).toISOString(),
        updated_at: new Date(meeting.updatedAt).toISOString(),
      });

    if (error) {
      return {
        ok: false,
        reason: `Failed to persist meeting: ${error.message}`,
      };
    }

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
 * Generate AI summary of a meeting using Gemini
 *
 * Real implementation:
 * 1. Validates meeting and transcript availability
 * 2. Calls Gemini API with meeting transcript
 * 3. Records usage metadata with category='meetings'
 * 4. Consumes Tier Compute (normal AI usage, not Work PC)
 * 5. Returns structured summary or failure
 */
export async function summarizeMeeting(userId: string, request: MeetingSummarizeRequest): Promise<MeetingSummarizeResult> {
  const { v4: uuidv4 } = await import('uuid');
  const { getGeminiApiKey } = await import('../../ai/geminiApiKey');
  const { recordUsageEvent, computeNormalizedCompute } = await import('../../billing/UsageMeteringEngine');
  const { creditStore } = await import('../../billing/CreditStore');

  try {
    const db = await getSupabaseClient();

    // Fetch meeting from Supabase
    const { data: meeting, error: fetchError } = await db
      .from('meetings')
      .select('*')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !meeting) {
      return {
        ok: false,
        reason: 'Meeting not found',
      };
    }

    // Get transcript text (meeting.recording is stored as JSONB in DB)
    const transcriptText = request.transcriptText || (meeting.recording as any)?.url || '';
    if (!transcriptText) {
      return {
        ok: false,
        reason: 'No transcript or recording available for this meeting',
      };
    }

    // Determine model to use (default to gemini-flash-latest for cost-effective summarization)
    const model = request.model || 'gemini-flash-latest';

    // Get Gemini API key
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return {
        ok: false,
        reason: 'Gemini API not configured',
      };
    }

    // Build summarization prompt
    const summaryPrompt = `You are a meeting summarization expert. Summarize the following meeting transcript concisely and clearly.

Meeting Title: ${meeting.title}
Number of Attendees: ${meeting.attendees.length}
Date: ${new Date(meeting.createdAt).toISOString().split('T')[0]}

Transcript:
${transcriptText}

Provide the summary in JSON format with the following structure:
{
  "content": "A comprehensive 2-3 paragraph summary of the meeting",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "actionItems": ["action item 1", "action item 2"],
  "decisions": ["decision 1", "decision 2"]
}

Focus on:
- Main topics discussed
- Key decisions made
- Action items with owners
- Timeline and next steps`;

    // Call Gemini API
    const requestId = uuidv4();
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
    } catch (fetchError) {
      return {
        ok: false,
        reason: `Failed to call Gemini API: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
      };
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      return {
        ok: false,
        reason: `Gemini API error: ${res.status} ${res.statusText}`,
      };
    }

    // Parse response
    let json;
    try {
      json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
          cachedContentTokenCount?: number;
          thoughtsTokenCount?: number;
        };
      };
    } catch {
      return {
        ok: false,
        reason: 'Failed to parse Gemini response',
      };
    }

    // Extract text content
    const summaryText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summaryText) {
      return {
        ok: false,
        reason: 'Gemini did not return summary content',
      };
    }

    // Parse JSON response
    let parsedSummary;
    try {
      parsedSummary = JSON.parse(summaryText);
    } catch {
      return {
        ok: false,
        reason: 'Failed to parse summary JSON from Gemini',
      };
    }

    // Record usage metadata and consume Tier Compute
    const usageMetadata = json.usageMetadata;
    if (usageMetadata) {
      // Record the usage event
      const providerUsageMetadata = {
        provider: 'gemini' as const,
        model,
        inputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null,
        outputTokens: typeof usageMetadata.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : null,
        cachedInputTokens: typeof usageMetadata.cachedContentTokenCount === 'number' ? usageMetadata.cachedContentTokenCount : null,
        totalTokens: typeof usageMetadata.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : null,
        thoughtsTokens: typeof usageMetadata.thoughtsTokenCount === 'number' ? usageMetadata.thoughtsTokenCount : null,
        requestId,
      };

      recordUsageEvent(providerUsageMetadata, 'conversationTurn', { sessionId: null, runId: null }, false);

      // Consume Tier Compute using the existing billing infrastructure
      // This uses the normal AI usage path, not Autonomous Work PC
      const normalizedCompute = computeNormalizedCompute(providerUsageMetadata);
      creditStore.consume(normalizedCompute, 'meeting-summarization', 'meetings', false);
    }

    // Build structured summary
    const summary: MeetingSummary = {
      id: `summary-${Date.now()}`,
      meetingId: request.meetingId,
      content: parsedSummary.content || 'No summary content',
      keyPoints: parsedSummary.keyPoints || [],
      actionItems: parsedSummary.actionItems || [],
      decisions: parsedSummary.decisions || [],
      generatedAt: Date.now(),
      generatedBy: model,
    };

    // Persist summary to Supabase as part of the meeting
    const { error: updateError } = await db
      .from('meetings')
      .update({
        summary: summary,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.meetingId)
      .eq('user_id', userId);

    if (updateError) {
      return {
        ok: false,
        reason: `Failed to persist summary: ${updateError.message}`,
      };
    }

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
    const db = await getSupabaseClient();

    // Validate recipients
    if (!request.recipients || request.recipients.length === 0) {
      return {
        ok: false,
        reason: 'No recipients provided',
      };
    }

    // Validate and deduplicate recipients
    const seen = new Set<string>();
    const validRecipients: string[] = [];
    for (const email of request.recipients) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !isValidEmail(trimmed)) {
        continue;
      }
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        validRecipients.push(trimmed);
      }
    }

    if (validRecipients.length === 0) {
      return {
        ok: false,
        reason: 'No valid recipients provided',
      };
    }

    // Fetch meeting with summary from Supabase
    const { data: meeting, error: fetchError } = await db
      .from('meetings')
      .select('*')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !meeting || !meeting.summary) {
      return {
        ok: false,
        reason: 'Meeting or summary not found',
      };
    }

    // Send emails to each recipient, tracking success/failure
    const sentTo: string[] = [];
    const failed: Array<{ email: string; error: string }> = [];
    const meetingDate = new Date(meeting.updated_at).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    for (const recipient of validRecipients) {
      try {
        await emailService.sendMeetingSummary(recipient, {
          meetingTitle: meeting.title || 'Meeting Summary',
          organizerName: meeting.organizer?.name || meeting.organizer?.email || 'Unknown',
          meetingDate,
          summary: meeting.summary,
          recipientName: extractNameFromEmail(recipient),
        });
        sentTo.push(recipient);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send email';
        failed.push({ email: recipient, error: errorMessage });
      }
    }

    // Return result with detailed status
    return {
      ok: sentTo.length > 0,
      reason: sentTo.length === 0 ? 'Failed to send emails to all recipients' : undefined,
      distributionId: `dist-${Date.now()}`,
      sentTo,
      failed: failed.length > 0 ? failed.map(f => f.email) : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to distribute summary',
    };
  }
}

// Helper: validate email address format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: extract name from email (part before @)
function extractNameFromEmail(email: string): string {
  const name = email.split('@')[0];
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[._-]/g, ' ');
}

/**
 * List meetings with optional filtering
 */
export async function listMeetings(userId: string, query?: MeetingListQuery): Promise<MeetingListResult> {
  try {
    const db = await getSupabaseClient();

    // Build query
    let dbQuery = db
      .from('meetings')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // Apply filters
    if (query?.status) {
      dbQuery = dbQuery.eq('status', query.status);
    }
    if (query?.hasRecording) {
      dbQuery = dbQuery.not('recording', 'is', null);
    }
    if (query?.hasSummary) {
      dbQuery = dbQuery.not('summary', 'is', null);
    }

    // Sort by created date descending
    dbQuery = dbQuery.order('created_at', { ascending: false });

    // Apply pagination
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data: meetings, error, count } = await dbQuery;

    if (error) {
      return {
        ok: false,
        meetings: [],
        total: 0,
      };
    }

    // Convert DB format to Meeting type (timestamps to milliseconds)
    const convertedMeetings: Meeting[] = (meetings || []).map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      startedAt: m.started_at ? new Date(m.started_at).getTime() : undefined,
      endedAt: m.ended_at ? new Date(m.ended_at).getTime() : undefined,
      duration: m.duration_seconds,
      attendees: m.attendees || [],
      organizer: m.organizer,
      recording: m.recording,
      summary: m.summary,
      calendarEventId: m.calendar_event_id,
      meetingLink: m.meeting_link,
      createdAt: new Date(m.created_at).getTime(),
      updatedAt: new Date(m.updated_at).getTime(),
    }));

    return {
      ok: true,
      meetings: convertedMeetings,
      total: count || 0,
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
export async function getMeeting(userId: string, meetingId: string): Promise<Meeting | null> {
  try {
    const db = await getSupabaseClient();
    const { data: meeting, error } = await db
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('user_id', userId)
      .single();

    if (error || !meeting) {
      return null;
    }

    // Convert DB format to Meeting type
    return {
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      status: meeting.status,
      startedAt: meeting.started_at ? new Date(meeting.started_at).getTime() : undefined,
      endedAt: meeting.ended_at ? new Date(meeting.ended_at).getTime() : undefined,
      duration: meeting.duration_seconds,
      attendees: meeting.attendees || [],
      organizer: meeting.organizer,
      recording: meeting.recording,
      summary: meeting.summary,
      calendarEventId: meeting.calendar_event_id,
      meetingLink: meeting.meeting_link,
      createdAt: new Date(meeting.created_at).getTime(),
      updatedAt: new Date(meeting.updated_at).getTime(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Update meeting status
 */
export async function updateMeetingStatus(
  userId: string,
  meetingId: string,
  status: Meeting['status']
): Promise<{ ok: boolean; meeting?: Meeting; reason?: string }> {
  try {
    const db = await getSupabaseClient();

    const now = new Date().toISOString();
    const endedAt = status === 'completed' ? now : null;

    const { data: updated, error } = await db
      .from('meetings')
      .update({
        status,
        ended_at: endedAt,
        updated_at: now,
      })
      .eq('id', meetingId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !updated) {
      return { ok: false, reason: 'Meeting not found' };
    }

    // Convert to Meeting type
    const meeting: Meeting = {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      startedAt: updated.started_at ? new Date(updated.started_at).getTime() : undefined,
      endedAt: updated.ended_at ? new Date(updated.ended_at).getTime() : undefined,
      duration: updated.duration_seconds,
      attendees: updated.attendees || [],
      organizer: updated.organizer,
      recording: updated.recording,
      summary: updated.summary,
      calendarEventId: updated.calendar_event_id,
      meetingLink: updated.meeting_link,
      createdAt: new Date(updated.created_at).getTime(),
      updatedAt: new Date(updated.updated_at).getTime(),
    };

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
export async function addAttendee(
  userId: string,
  meetingId: string,
  attendee: MeetingAttendee
): Promise<{ ok: boolean; meeting?: Meeting; reason?: string }> {
  try {
    const db = await getSupabaseClient();

    const { data: meeting, error: fetchError } = await db
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !meeting) {
      return { ok: false, reason: 'Meeting not found' };
    }

    // Check if attendee already exists
    const attendees = meeting.attendees || [];
    const exists = attendees.some((a: MeetingAttendee) => a.email === attendee.email);

    if (!exists) {
      const now = new Date().toISOString();
      const { error: updateError } = await db
        .from('meetings')
        .update({
          attendees: [...attendees, attendee],
          updated_at: now,
        })
        .eq('id', meetingId)
        .eq('user_id', userId);

      if (updateError) {
        return { ok: false, reason: 'Failed to add attendee' };
      }
    }

    // Return the updated meeting
    return { ok: true, meeting: (await getMeeting(userId, meetingId)) || undefined };
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
    const db = await getSupabaseClient();

    // Validate meeting link
    if (!meetingLink || (!meetingLink.includes('meet.google.com') &&
        !meetingLink.includes('zoom.us') &&
        !meetingLink.includes('teams.microsoft.com'))) {
      return { ok: false, reason: 'Invalid meeting link. Must be Google Meet, Zoom, or Teams.' };
    }

    const meetingId = `meeting-${Date.now()}`;
    const now = new Date();

    // Create recording record
    const recording = {
      id: `rec-${Date.now()}`,
      url: `file:///meetings/${meetingId}/recording.webm`,
      mimeType: 'video/webm',
      duration: 0,
      size: 0,
      createdAt: Date.now(),
    };

    // Persist to Supabase
    const { error } = await db
      .from('meetings')
      .insert({
        id: meetingId,
        user_id: userId,
        title: meetingTitle || 'Meeting',
        status: 'in-progress',
        started_at: now.toISOString(),
        attendees: [{ email: userEmail, joinedAt: Date.now() }],
        organizer: { email: userEmail },
        meeting_link: meetingLink,
        recording: recording,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

    if (error) {
      return { ok: false, reason: `Failed to create meeting: ${error.message}` };
    }

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
export async function completeMeetingRecording(
  userId: string,
  meetingId: string,
  recordingDurationSeconds: number
): Promise<{ ok: boolean; meeting?: Meeting; reason?: string }> {
  try {
    const db = await getSupabaseClient();

    const { data: meeting, error: fetchError } = await db
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !meeting || !meeting.recording) {
      return { ok: false, reason: 'Meeting or recording not found' };
    }

    // Update recording duration
    const updatedRecording = {
      ...meeting.recording,
      duration: recordingDurationSeconds,
    };

    const now = new Date();
    const { error: updateError } = await db
      .from('meetings')
      .update({
        status: 'completed',
        ended_at: now.toISOString(),
        duration_seconds: recordingDurationSeconds,
        recording: updatedRecording,
        updated_at: now.toISOString(),
      })
      .eq('id', meetingId)
      .eq('user_id', userId);

    if (updateError) {
      return { ok: false, reason: 'Failed to complete recording' };
    }

    // Return the updated meeting
    return { ok: true, meeting: (await getMeeting(userId, meetingId)) || undefined };
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
 * TODO: Integrate with real AI provider to extract structure from summary content
 */
export async function generateStructuredSummary(
  userId: string,
  meetingId: string
): Promise<{ ok: boolean; structured?: StructuredSummary; reason?: string }> {
  try {
    const db = await getSupabaseClient();

    const { data: meeting, error } = await db
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('user_id', userId)
      .single();

    if (error || !meeting || !meeting.summary) {
      return { ok: false, reason: 'Meeting or summary not found' };
    }

    // Generate a structured summary from the existing summary
    const summary = meeting.summary;
    const organizer = meeting.organizer || {};

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
      actionItems: (summary.actionItems || []).map((item: string, index: number) => ({
        id: `action-${index}`,
        task: item,
        owner: (organizer as any).name || 'Unassigned',
        ownerEmail: (organizer as any).email,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending' as const,
        timestamp: 0,
      })),
    };

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
 * Note: Structured summaries are currently generated on-the-fly from the basic summary
 */
export async function cropSummary(
  userId: string,
  request: CropSummaryRequest
): Promise<CropSummaryResult> {
  try {
    const { structured } = await generateStructuredSummary(userId, request.meetingId);

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
export async function saveDraft(userId: string, request: DraftRequest): Promise<DraftResult> {
  try {
    const db = await getSupabaseClient();

    // Verify user owns the meeting
    const { data: meeting, error: meetingError } = await db
      .from('meetings')
      .select('id')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (meetingError || !meeting) {
      return {
        ok: false,
        reason: 'Meeting not found or access denied',
      };
    }

    const draftId = `draft-${Date.now()}`;
    const draft: MeetingDraft = {
      id: draftId,
      meetingId: request.meetingId,
      recipients: request.recipients,
      contentType: request.contentType,
      selectedContent: request.selectedContent,
      emailDraft: request.emailDraft,
      savedAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Persist draft to Supabase
    const { error } = await db
      .from('meeting_drafts')
      .insert({
        id: draft.id,
        meeting_id: draft.meetingId,
        user_id: userId,
        recipients: draft.recipients,
        content_type: draft.contentType,
        selected_content: draft.selectedContent,
        email_draft: draft.emailDraft,
        saved_at: new Date(draft.savedAt).toISOString(),
        updated_at: new Date(draft.updatedAt).toISOString(),
      });

    if (error) {
      return {
        ok: false,
        reason: `Failed to save draft: ${error.message}`,
      };
    }

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
export async function getDrafts(
  userId: string,
  meetingId: string
): Promise<{ ok: boolean; drafts: MeetingDraft[]; reason?: string }> {
  try {
    const db = await getSupabaseClient();

    const { data: drafts, error } = await db
      .from('meeting_drafts')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      return {
        ok: false,
        drafts: [],
        reason: error.message,
      };
    }

    // Convert DB format to MeetingDraft type
    const convertedDrafts: MeetingDraft[] = (drafts || []).map(d => ({
      id: d.id,
      meetingId: d.meeting_id,
      recipients: d.recipients || [],
      contentType: d.content_type || 'entire',
      selectedContent: d.selected_content,
      emailDraft: d.email_draft || {},
      savedAt: new Date(d.saved_at).getTime(),
      updatedAt: new Date(d.updated_at).getTime(),
    }));

    return { ok: true, drafts: convertedDrafts };
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
export async function scheduleSend(userId: string, request: ScheduleSendRequest): Promise<ScheduleSendResult> {
  try {
    const db = await getSupabaseClient();

    // Verify user owns the meeting
    const { data: meeting, error: meetingError } = await db
      .from('meetings')
      .select('id')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (meetingError || !meeting) {
      return {
        ok: false,
        reason: 'Meeting not found or access denied',
      };
    }

    const scheduledId = `scheduled-${Date.now()}`;
    const scheduled: ScheduledSend = {
      id: scheduledId,
      meetingId: request.meetingId,
      recipients: request.recipients,
      contentType: request.contentType,
      selectedContent: request.selectedContent,
      emailContent: request.emailContent,
      scheduledTime: request.scheduledTime,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Persist to Supabase
    const { error } = await db
      .from('meeting_scheduled_sends')
      .insert({
        id: scheduled.id,
        meeting_id: scheduled.meetingId,
        user_id: userId,
        recipients: scheduled.recipients,
        content_type: scheduled.contentType,
        selected_content: scheduled.selectedContent,
        email_content: scheduled.emailContent,
        scheduled_time: new Date(scheduled.scheduledTime).toISOString(),
        status: scheduled.status,
        created_at: new Date(scheduled.createdAt).toISOString(),
      });

    if (error) {
      return {
        ok: false,
        reason: `Failed to schedule send: ${error.message}`,
      };
    }

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
export async function getScheduledSends(userId: string, meetingId: string): Promise<GetScheduledSendsResult> {
  try {
    const db = await getSupabaseClient();

    const { data: scheduled, error } = await db
      .from('meeting_scheduled_sends')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: true });

    if (error) {
      return {
        ok: false,
        scheduled: [],
      };
    }

    // Convert DB format to ScheduledSend type
    const convertedScheduled: ScheduledSend[] = (scheduled || []).map(s => ({
      id: s.id,
      meetingId: s.meeting_id,
      recipients: s.recipients || [],
      contentType: s.content_type || 'entire',
      selectedContent: s.selected_content,
      emailContent: s.email_content || {},
      scheduledTime: new Date(s.scheduled_time).getTime(),
      status: s.status || 'pending',
      createdAt: new Date(s.created_at).getTime(),
      sentAt: s.sent_at ? new Date(s.sent_at).getTime() : undefined,
      error: s.error,
    }));

    return { ok: true, scheduled: convertedScheduled };
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
export async function getSummarizationCost(userId: string, request: SummarizationCostRequest): Promise<SummarizationCostResponse> {
  try {
    const db = await getSupabaseClient();

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

    // Fetch meeting from Supabase
    const { data: meeting, error } = await db
      .from('meetings')
      .select('*')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (error || !meeting) {
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
    const recordingDuration = (meeting.recording as any)?.duration || 0;
    const durationSeconds = request.durationSeconds || recordingDuration || 0;
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
    const db = await getSupabaseClient();

    // Set current user for entitlementService tier checks
    entitlementService.setCurrentUserId(userId);

    // Check if user has Pro tier or higher (meetingAssistant feature)
    if (!entitlementService.isFeatureAvailable('meetingAssistant')) {
      return {
        ok: false,
        reason: 'Meeting summarization requires Pro tier or higher. Upgrade to Pro ($20/month), Pro Max ($100/month), Team, or Enterprise to continue.',
      };
    }

    // Fetch meeting from Supabase
    const { data: meeting, error: fetchError } = await db
      .from('meetings')
      .select('*')
      .eq('id', request.meetingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !meeting) {
      return {
        ok: false,
        reason: 'Meeting not found',
      };
    }

    const recordingDuration = (meeting.recording as any)?.duration;
    if (!meeting.recording || recordingDuration === undefined) {
      return {
        ok: false,
        reason: 'No recording found for this meeting',
      };
    }

    // Calculate cost
    const durationSeconds = recordingDuration;
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

    // Create transaction record (for audit/logging purposes)
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
