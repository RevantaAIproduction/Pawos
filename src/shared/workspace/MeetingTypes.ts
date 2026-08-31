/**
 * Shared types for meeting management and AI summarization.
 * Pro tier and higher features for recording, transcribing, and summarizing meetings.
 */

export interface MeetingAttendee {
  email: string;
  name?: string;
  joinedAt?: number;
  leftAt?: number;
}

export interface MeetingRecording {
  id: string;
  url: string;
  mimeType: string;
  duration: number; // in seconds
  size: number; // in bytes
  createdAt: number;
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  content: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  generatedAt: number;
  generatedBy: string; // AI model name
}

export type MeetingStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  status: MeetingStatus;
  startedAt?: number;
  endedAt?: number;
  duration?: number; // in seconds
  attendees: MeetingAttendee[];
  organizer: MeetingAttendee;
  recording?: MeetingRecording;
  summary?: MeetingSummary;
  calendarEventId?: string; // Google Calendar event ID if synced
  meetingLink?: string; // Zoom/Teams/Meet link
  createdAt: number;
  updatedAt: number;
}

export interface MeetingRecordRequest {
  meetingId: string;
  title: string;
  attendees?: string[];
}

export interface MeetingRecordResult {
  ok: boolean;
  reason?: string;
  recording?: MeetingRecording;
}

export interface MeetingSummarizeRequest {
  meetingId: string;
  recordingId?: string;
  transcriptText?: string;
  model?: string; // AI model to use
}

export interface MeetingSummarizeResult {
  ok: boolean;
  reason?: string;
  summary?: MeetingSummary;
}

export type DistributionMethod = 'all' | 'selected' | 'admin';

export interface MeetingDistributeRequest {
  meetingId: string;
  summaryId: string;
  recipients: string[]; // email addresses
  method: DistributionMethod;
  message?: string;
  includeRecordingLink?: boolean;
}

export interface MeetingDistributeResult {
  ok: boolean;
  reason?: string;
  distributionId?: string;
  sentTo?: string[];
  failed?: string[];
}

export interface MeetingListQuery {
  limit?: number;
  offset?: number;
  status?: MeetingStatus;
  hasRecording?: boolean;
  hasSummary?: boolean;
}

export interface MeetingListResult {
  ok: boolean;
  meetings: Meeting[];
  total: number;
}

// Structured Summary Types
export interface TopicSegment {
  name: string;
  timestamp: number; // in seconds
  content: string;
  duration?: number; // in seconds
}

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  ownerEmail?: string;
  dueDate?: string;
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: number; // in seconds, links to recording segment
}

export interface StructuredSummary {
  purpose: string;
  keyTakeaways: string[];
  topics: TopicSegment[];
  actionItems: ActionItem[];
}

// Distribution Types
export interface DistributionRequest {
  meetingId: string;
  recipients: string[]; // email addresses
  contentType: 'entire' | 'cropped';
  selectedTopics?: string[]; // topic names to include if cropped
  selectedActionItems?: string[]; // action item IDs to include if cropped
  sendMethod: 'now' | 'scheduled' | 'draft';
  scheduledTime?: number; // timestamp
  includeRecording?: boolean;
  includeTimestamps?: boolean;
}

export interface DistributionResult {
  ok: boolean;
  reason?: string;
  distributionId?: string;
  sentTo?: string[];
  failed?: string[];
  draftId?: string;
  scheduledId?: string;
}

// Cropping Types
export interface CroppedSummary {
  purpose?: string;
  keyTakeaways?: string[];
  topics: TopicSegment[];
  actionItems: ActionItem[];
}

export interface CropSummaryRequest {
  meetingId: string;
  selectedTopics?: string[];
  selectedActionItems?: string[];
}

export interface CropSummaryResult {
  ok: boolean;
  reason?: string;
  cropped?: CroppedSummary;
}

// Draft Types
export interface MeetingDraft {
  id: string;
  meetingId: string;
  recipients: string[];
  contentType: 'entire' | 'cropped';
  selectedContent?: {
    topics: string[];
    actionItems: string[];
  };
  emailDraft: {
    subject: string;
    body: string;
    previewText?: string;
  };
  savedAt: number;
  updatedAt: number;
}

export interface DraftRequest {
  meetingId: string;
  recipients: string[];
  contentType: 'entire' | 'cropped';
  selectedContent?: {
    topics: string[];
    actionItems: string[];
  };
  emailDraft: {
    subject: string;
    body: string;
    previewText?: string;
  };
}

export interface DraftResult {
  ok: boolean;
  reason?: string;
  draft?: MeetingDraft;
}

// Scheduled Send Types
export interface ScheduledSend {
  id: string;
  meetingId: string;
  recipients: string[];
  contentType: 'entire' | 'cropped';
  selectedContent?: {
    topics: string[];
    actionItems: string[];
  };
  emailContent: {
    subject: string;
    body: string;
  };
  scheduledTime: number;
  status: 'pending' | 'sent' | 'failed';
  createdAt: number;
  sentAt?: number;
  error?: string;
}

export interface ScheduleSendRequest {
  meetingId: string;
  recipients: string[];
  contentType: 'entire' | 'cropped';
  selectedContent?: {
    topics: string[];
    actionItems: string[];
  };
  emailContent: {
    subject: string;
    body: string;
  };
  scheduledTime: number;
}

export interface ScheduleSendResult {
  ok: boolean;
  reason?: string;
  scheduledSend?: ScheduledSend;
}

export interface GetScheduledSendsResult {
  ok: boolean;
  scheduled: ScheduledSend[];
}

// Distribution Preferences Types
export interface DistributionPreferences {
  recipients: string[];
  availableRecipients: string[];
  includeRecording: boolean;
  includeTimestamps: boolean;
}

// ── Meeting Summarization Compute Cost Types ──────────────────────────────
/**
 * Paw Compute cost for meeting summarization:
 * 1 minute recording = 0.5 PC
 * 1 hour recording = 30 PC
 *
 * Meeting Assistant (summarization) requires Pro tier or higher (Pro, Pro Max, Team, Enterprise).
 * Free tier users will receive a tier requirement error before cost calculation.
 */
export interface SummarizationCostRequest {
  meetingId: string;
  durationSeconds: number;
}

export interface SummarizationCostResponse {
  ok?: boolean;
  cost?: number; // Paw Compute cost (rounded to 2 decimals)
  durationMinutes?: number;
  currentBalance?: number; // Current Paw Compute balance
  newBalance?: number; // Balance after deduction (projected)
  canSummarize?: boolean; // Whether user has sufficient balance
  // Tier gating response (when tier requirement not met)
  error?: 'TIER_REQUIRED';
  message?: string;
  requiredTier?: 'pro' | 'proMax' | 'team' | 'enterprise';
}

export interface SummarizationCostTransaction {
  id: string;
  userId: string;
  meetingId: string;
  cost: number; // PC deducted
  durationMinutes: number;
  durationSeconds: number;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
  reason?: string; // Reason for failure if status='failed'
}

export interface MeetingSummarizeWithCostRequest {
  meetingId: string;
  recordingId?: string;
  transcriptText?: string;
  model?: string;
  userId: string;
}

export interface MeetingSummarizeWithCostResult {
  ok: boolean;
  reason?: string;
  summary?: MeetingSummary;
  transaction?: SummarizationCostTransaction;
  costDeducted?: number; // PC cost that was deducted
}
