/**
 * Platform Integration Extensions
 *
 * Real-time inline cards for all PawOS integrations:
 * - Ticket systems (Jira, Linear, GitHub Issues)
 * - Version control (Git, GitHub, GitLab)
 * - Communication (Slack, Teams, Discord)
 * - Code review (PRs, comments)
 * - Meetings & recordings
 * - Email & calendars
 * - Project management
 */

// ============================================================================
// TICKET SYSTEMS (Jira, Linear, GitHub Issues)
// ============================================================================

export interface JiraTicketExtension {
  type: 'jira-ticket';
  id: string;
  ticketId: string;
  title: string;
  description?: string;
  status: 'open' | 'in-progress' | 'in-review' | 'done' | 'closed';
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  assignee?: string;
  url: string;
  projectKey: string;
  action: 'created' | 'updated' | 'commented' | 'closed';
  timestamp: number;
}

export interface LinearTicketExtension {
  type: 'linear-ticket';
  id: string;
  ticketId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'cancelled';
  priority: 0 | 1 | 2 | 3 | 4; // 0=no priority, 1=urgent, 4=low
  assignee?: string;
  url: string;
  teamKey: string;
  action: 'created' | 'updated' | 'commented' | 'closed';
  timestamp: number;
}

export interface GitHubIssueExtension {
  type: 'github-issue';
  id: string;
  issueNumber: number;
  title: string;
  description?: string;
  status: 'open' | 'closed';
  labels?: string[];
  assignee?: string;
  url: string;
  repository: string;
  action: 'created' | 'updated' | 'commented' | 'closed';
  timestamp: number;
}

// ============================================================================
// GIT & VERSION CONTROL (Commits, Branches, Diffs)
// ============================================================================

export interface GitCommitExtension {
  type: 'git-commit';
  id: string;
  commitHash: string;
  message: string;
  author?: string;
  branch: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  url?: string;
  status: 'staged' | 'committed' | 'pushed' | 'failed';
  timestamp: number;
}

export interface GitBranchExtension {
  type: 'git-branch';
  id: string;
  branchName: string;
  baseBranch: string;
  status: 'created' | 'pushed' | 'merged' | 'deleted';
  commitsAhead?: number;
  timestamp: number;
}

export interface GitDiffExtension {
  type: 'git-diff';
  id: string;
  status: 'staged' | 'committed' | 'pushed' | 'failed';
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
    preview?: string;
  }>;
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
  timestamp: number;
}

// ============================================================================
// PULL REQUESTS & CODE REVIEW (GitHub, GitLab, Bitbucket)
// ============================================================================

export interface PullRequestExtension {
  type: 'pull-request';
  id: string;
  prNumber: number;
  title: string;
  description?: string;
  status: 'draft' | 'open' | 'in-review' | 'approved' | 'changes-requested' | 'merged' | 'closed';
  sourceBranch: string;
  targetBranch: string;
  url: string;
  author?: string;
  repository: string;
  reviewers?: string[];
  commitCount?: number;
  filesChanged?: number;
  action: 'created' | 'updated' | 'opened-review' | 'approved' | 'commented' | 'merged' | 'closed';
  timestamp: number;
}

export interface CodeReviewExtension {
  type: 'code-review';
  id: string;
  reviewId: string;
  status: 'pending' | 'in-progress' | 'completed';
  reviewerCount?: number;
  approvalsNeeded?: number;
  approvalsReceived?: number;
  filesReviewed?: number;
  totalFiles?: number;
  comments?: number;
  suggestedChanges?: number;
  url?: string;
  timestamp: number;
}

export interface CodeCommentExtension {
  type: 'code-comment';
  id: string;
  commentId: string;
  author?: string;
  text: string;
  file?: string;
  line?: number;
  status: 'pending' | 'resolved' | 'outdated';
  replies?: number;
  url?: string;
  timestamp: number;
}

// ============================================================================
// COMMUNICATION (Slack, Teams, Discord, Email)
// ============================================================================

export interface SlackMessageExtension {
  type: 'slack-message';
  id: string;
  messageId: string;
  channelName: string;
  text: string;
  status: 'sent' | 'failed' | 'edited';
  reactions?: number;
  replies?: number;
  threadId?: string;
  url?: string;
  timestamp: number;
}

export interface TeamsMessageExtension {
  type: 'teams-message';
  id: string;
  messageId: string;
  channelName: string;
  text: string;
  status: 'sent' | 'failed' | 'edited';
  reactions?: number;
  replies?: number;
  url?: string;
  timestamp: number;
}

export interface EmailExtension {
  type: 'email';
  id: string;
  messageId: string;
  to: string[];
  cc?: string[];
  subject: string;
  preview?: string;
  status: 'draft' | 'sent' | 'failed' | 'scheduled';
  url?: string;
  timestamp: number;
}

export interface DiscordMessageExtension {
  type: 'discord-message';
  id: string;
  messageId: string;
  channelName: string;
  text: string;
  status: 'sent' | 'failed' | 'edited';
  reactions?: number;
  url?: string;
  timestamp: number;
}

// ============================================================================
// MEETINGS & RECORDINGS (Calendar, Recording, Transcription)
// ============================================================================

export interface MeetingExtension {
  type: 'meeting';
  id: string;
  meetingId: string;
  title: string;
  status: 'scheduled' | 'recording' | 'recording-paused' | 'recorded' | 'ended';
  platform: 'zoom' | 'teams' | 'google-meet' | 'webex' | 'slack';
  participants?: number;
  duration?: number; // seconds
  recordingUrl?: string;
  url?: string;
  timestamp: number;
}

export interface RecordingExtension {
  type: 'recording';
  id: string;
  recordingId: string;
  title: string;
  platform: string;
  duration: number; // seconds
  status: 'recording' | 'processing' | 'ready' | 'transcribing';
  progress?: number; // 0-100
  url?: string;
  transcriptionStatus?: 'pending' | 'in-progress' | 'complete';
  timestamp: number;
}

export interface TranscriptionExtension {
  type: 'transcription';
  id: string;
  transcriptionId: string;
  title: string;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  progress?: number; // 0-100
  wordCount?: number;
  summaryAvailable?: boolean;
  url?: string;
  timestamp: number;
}

export interface MeetingSummaryExtension {
  type: 'meeting-summary';
  id: string;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  meetingId: string;
  title: string;
  duration: number; // minutes
  participants?: string[];
  summary?: string;
  keyPoints?: string[];
  actionItems?: Array<{
    task: string;
    owner?: string;
  }>;
  url?: string;
  timestamp: number;
}

// ============================================================================
// CALENDAR & SCHEDULING
// ============================================================================

export interface CalendarEventExtension {
  type: 'calendar-event';
  id: string;
  eventId: string;
  title: string;
  startTime: number;
  endTime: number;
  status: 'pending' | 'scheduled' | 'accepted' | 'declined' | 'tentative';
  attendees?: string[];
  location?: string;
  url?: string;
  timestamp: number;
}

// ============================================================================
// PROJECT MANAGEMENT (Asana, Monday, Notion, etc.)
// ============================================================================

export interface TaskExtension {
  type: 'project-task';
  id: string;
  taskId: string;
  title: string;
  status: 'todo' | 'in-progress' | 'in-review' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  dueDate?: number;
  project?: string;
  url?: string;
  action: 'created' | 'updated' | 'completed' | 'commented';
  timestamp: number;
}

// ============================================================================
// CLOUD STORAGE & FILES (Google Drive, OneDrive, Dropbox)
// ============================================================================

export interface FileUploadExtension {
  type: 'file-upload';
  id: string;
  fileName: string;
  fileSize: number; // bytes
  status: 'uploading' | 'uploaded' | 'failed';
  progress?: number; // 0-100
  platform: 'google-drive' | 'onedrive' | 'dropbox' | 's3';
  url?: string;
  timestamp: number;
}

// ============================================================================
// BUILD & DEPLOYMENT
// ============================================================================

export interface BuildExtension {
  type: 'build';
  id: string;
  buildId: string;
  buildName: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
  progress?: number; // 0-100
  duration?: number; // seconds
  url?: string;
  timestamp: number;
}

export interface DeploymentExtension {
  type: 'deployment';
  id: string;
  deploymentId: string;
  service: string;
  environment: 'dev' | 'staging' | 'production';
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled-back';
  progress?: number; // 0-100
  version?: string;
  url?: string;
  timestamp: number;
}

// ============================================================================
// API & WEBHOOKS
// ============================================================================

export interface WebhookEventExtension {
  type: 'webhook-event';
  id: string;
  eventId: string;
  eventType: string;
  source: string;
  status: 'received' | 'processed' | 'failed';
  payload?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// INTEGRATED PLATFORM EXTENSION (Meta type)
// ============================================================================

export type PlatformExtension =
  | JiraTicketExtension
  | LinearTicketExtension
  | GitHubIssueExtension
  | GitCommitExtension
  | GitBranchExtension
  | GitDiffExtension
  | PullRequestExtension
  | CodeReviewExtension
  | CodeCommentExtension
  | SlackMessageExtension
  | TeamsMessageExtension
  | EmailExtension
  | DiscordMessageExtension
  | MeetingExtension
  | RecordingExtension
  | TranscriptionExtension
  | MeetingSummaryExtension
  | CalendarEventExtension
  | TaskExtension
  | FileUploadExtension
  | BuildExtension
  | DeploymentExtension
  | WebhookEventExtension;

/**
 * Route platform extensions to the correct display handler
 */
export function getPlatformExtensionType(extension: PlatformExtension): string {
  return extension.type;
}

/**
 * Get expand target for platform extensions
 */
export function getPlatformExtensionExpandTarget(extension: PlatformExtension): 'browser' | 'terminal' | 'worktree' | 'agents' | 'tasks' | null {
  switch (extension.type) {
    case 'jira-ticket':
    case 'linear-ticket':
    case 'github-issue':
    case 'pull-request':
    case 'code-review':
    case 'code-comment':
    case 'slack-message':
    case 'teams-message':
    case 'email':
    case 'discord-message':
    case 'meeting':
    case 'recording':
    case 'transcription':
    case 'meeting-summary':
    case 'calendar-event':
    case 'project-task':
    case 'file-upload':
      return 'browser';

    case 'git-commit':
    case 'git-branch':
    case 'git-diff':
      return 'worktree';

    case 'build':
    case 'deployment':
    case 'webhook-event':
      return 'terminal';

    default:
      return null;
  }
}
