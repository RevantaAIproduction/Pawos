/**
 * Platform Extension Helpers
 *
 * Factory functions for creating extensions for all integrated platforms.
 */

import type {
  JiraTicketExtension,
  LinearTicketExtension,
  GitHubIssueExtension,
  GitCommitExtension,
  GitBranchExtension,
  GitDiffExtension,
  PullRequestExtension,
  CodeReviewExtension,
  CodeCommentExtension,
  SlackMessageExtension,
  TeamsMessageExtension,
  EmailExtension,
  DiscordMessageExtension,
  MeetingExtension,
  RecordingExtension,
  TranscriptionExtension,
  MeetingSummaryExtension,
  CalendarEventExtension,
  TaskExtension,
  FileUploadExtension,
  BuildExtension,
  DeploymentExtension,
  WebhookEventExtension,
} from './PlatformExtensionTypes';

// ============================================================================
// TICKET SYSTEMS
// ============================================================================

export function createJiraTicketExtension(options: Omit<JiraTicketExtension, 'type' | 'timestamp'>): JiraTicketExtension {
  return {
    ...options,
    type: 'jira-ticket',
    timestamp: Date.now(),
  };
}

export function createLinearTicketExtension(options: Omit<LinearTicketExtension, 'type' | 'timestamp'>): LinearTicketExtension {
  return {
    ...options,
    type: 'linear-ticket',
    timestamp: Date.now(),
  };
}

export function createGitHubIssueExtension(options: Omit<GitHubIssueExtension, 'type' | 'timestamp'>): GitHubIssueExtension {
  return {
    ...options,
    type: 'github-issue',
    timestamp: Date.now(),
  };
}

// ============================================================================
// GIT & VERSION CONTROL
// ============================================================================

export function createGitCommitExtension(options: Omit<GitCommitExtension, 'type' | 'timestamp'>): GitCommitExtension {
  return {
    ...options,
    type: 'git-commit',
    timestamp: Date.now(),
  };
}

export function createGitBranchExtension(options: Omit<GitBranchExtension, 'type' | 'timestamp'>): GitBranchExtension {
  return {
    ...options,
    type: 'git-branch',
    timestamp: Date.now(),
  };
}

export function createGitDiffExtension(options: Omit<GitDiffExtension, 'type' | 'timestamp'>): GitDiffExtension {
  return {
    ...options,
    type: 'git-diff',
    timestamp: Date.now(),
  };
}

// ============================================================================
// PULL REQUESTS & CODE REVIEW
// ============================================================================

export function createPullRequestExtension(options: Omit<PullRequestExtension, 'type' | 'timestamp'>): PullRequestExtension {
  return {
    ...options,
    type: 'pull-request',
    timestamp: Date.now(),
  };
}

export function createCodeReviewExtension(options: Omit<CodeReviewExtension, 'type' | 'timestamp'>): CodeReviewExtension {
  return {
    ...options,
    type: 'code-review',
    timestamp: Date.now(),
  };
}

export function createCodeCommentExtension(options: Omit<CodeCommentExtension, 'type' | 'timestamp'>): CodeCommentExtension {
  return {
    ...options,
    type: 'code-comment',
    timestamp: Date.now(),
  };
}

// ============================================================================
// COMMUNICATION
// ============================================================================

export function createSlackMessageExtension(options: Omit<SlackMessageExtension, 'type' | 'timestamp'>): SlackMessageExtension {
  return {
    ...options,
    type: 'slack-message',
    timestamp: Date.now(),
  };
}

export function createTeamsMessageExtension(options: Omit<TeamsMessageExtension, 'type' | 'timestamp'>): TeamsMessageExtension {
  return {
    ...options,
    type: 'teams-message',
    timestamp: Date.now(),
  };
}

export function createEmailExtension(options: Omit<EmailExtension, 'type' | 'timestamp'>): EmailExtension {
  return {
    ...options,
    type: 'email',
    timestamp: Date.now(),
  };
}

export function createDiscordMessageExtension(options: Omit<DiscordMessageExtension, 'type' | 'timestamp'>): DiscordMessageExtension {
  return {
    ...options,
    type: 'discord-message',
    timestamp: Date.now(),
  };
}

// ============================================================================
// MEETINGS & RECORDINGS
// ============================================================================

export function createMeetingExtension(options: Omit<MeetingExtension, 'type' | 'timestamp'>): MeetingExtension {
  return {
    ...options,
    type: 'meeting',
    timestamp: Date.now(),
  };
}

export function createRecordingExtension(options: Omit<RecordingExtension, 'type' | 'timestamp'>): RecordingExtension {
  return {
    ...options,
    type: 'recording',
    timestamp: Date.now(),
  };
}

export function createTranscriptionExtension(options: Omit<TranscriptionExtension, 'type' | 'timestamp'>): TranscriptionExtension {
  return {
    ...options,
    type: 'transcription',
    timestamp: Date.now(),
  };
}

export function createMeetingSummaryExtension(options: Omit<MeetingSummaryExtension, 'type' | 'timestamp'>): MeetingSummaryExtension {
  return {
    ...options,
    type: 'meeting-summary',
    timestamp: Date.now(),
  };
}

// ============================================================================
// CALENDAR & SCHEDULING
// ============================================================================

export function createCalendarEventExtension(options: Omit<CalendarEventExtension, 'type' | 'timestamp'>): CalendarEventExtension {
  return {
    ...options,
    type: 'calendar-event',
    timestamp: Date.now(),
  };
}

// ============================================================================
// PROJECT MANAGEMENT
// ============================================================================

export function createTaskExtension(options: Omit<TaskExtension, 'type' | 'timestamp'>): TaskExtension {
  return {
    ...options,
    type: 'project-task',
    timestamp: Date.now(),
  };
}

// ============================================================================
// CLOUD STORAGE & FILES
// ============================================================================

export function createFileUploadExtension(options: Omit<FileUploadExtension, 'type' | 'timestamp'>): FileUploadExtension {
  return {
    ...options,
    type: 'file-upload',
    timestamp: Date.now(),
  };
}

// ============================================================================
// BUILD & DEPLOYMENT
// ============================================================================

export function createBuildExtension(options: Omit<BuildExtension, 'type' | 'timestamp'>): BuildExtension {
  return {
    ...options,
    type: 'build',
    timestamp: Date.now(),
  };
}

export function createDeploymentExtension(options: Omit<DeploymentExtension, 'type' | 'timestamp'>): DeploymentExtension {
  return {
    ...options,
    type: 'deployment',
    timestamp: Date.now(),
  };
}

// ============================================================================
// API & WEBHOOKS
// ============================================================================

export function createWebhookEventExtension(options: Omit<WebhookEventExtension, 'type' | 'timestamp'>): WebhookEventExtension {
  return {
    ...options,
    type: 'webhook-event',
    timestamp: Date.now(),
  };
}
