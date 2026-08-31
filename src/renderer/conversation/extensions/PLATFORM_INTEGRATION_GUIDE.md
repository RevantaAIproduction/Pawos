# Platform Extensions — Complete Integration Guide

All PawOS integrations now display as **inline live extension cards** in the conversation. Real-time updates for tickets, git, comments, calls, and everything else.

---

## **How It Works**

When you interact with integrated platforms, the action appears inline as a compact card:

```
User: "Create a Jira ticket for this"
     ↓
[Assistant] "Creating ticket..."
[🔗 Jira Ticket] PROJ-123: Fix login issue
              Priority: High | Status: OPEN [↗]

User: "Create a PR for that branch"
     ↓
[Assistant] "Pushing and opening PR..."
[🔀 Pull Request] #42: Add new feature
    1 reviewer | 5 commits | 12 files changed [↗]

User: "Notify the team in Slack"
     ↓
[Assistant] "Sending message..."
[💬 Slack Message] #engineering
   "The feature is ready for testing!"
    Status: SENT [↗]
```

Click **↗** to open in the Browser card for full details and comments.

---

## **All Integrated Platforms**

### **TICKET SYSTEMS**

#### Jira
```typescript
import { createJiraTicketExtension } from './extensions';

const ext = createJiraTicketExtension({
  id: 'jira-1',
  ticketId: '123',
  title: 'Fix login authentication',
  description: 'Users unable to login with OAuth',
  status: 'open',
  priority: 'high',
  assignee: 'alice@company.com',
  url: 'https://jira.company.com/browse/PROJ-123',
  projectKey: 'PROJ',
  action: 'created',
});
```

**Displays:**
- Status badge (OPEN, IN PROGRESS, DONE, etc.)
- Priority indicator
- Assignee
- Description
- Click ↗ → opens in Browser

**Real-time updates:**
- Status changes → card updates
- Assignment changes → card updates
- Comments → card shows count

#### Linear
```typescript
import { createLinearTicketExtension } from './extensions';

const ext = createLinearTicketExtension({
  id: 'linear-1',
  ticketId: 'ENG-42',
  title: 'Refactor database queries',
  status: 'in-progress',
  priority: 2, // 0=no, 1=urgent, 4=low
  assignee: 'bob@company.com',
  url: 'https://linear.app/company/issue/ENG-42',
  teamKey: 'ENG',
  action: 'created',
});
```

#### GitHub Issues
```typescript
import { createGitHubIssueExtension } from './extensions';

const ext = createGitHubIssueExtension({
  id: 'gh-issue-1',
  issueNumber: 456,
  title: 'Performance degradation in search',
  status: 'open',
  labels: ['bug', 'performance', 'critical'],
  assignee: 'charlie@company.com',
  url: 'https://github.com/company/repo/issues/456',
  repository: 'company/repo',
  action: 'created',
});
```

---

### **GIT & VERSION CONTROL**

#### Git Commits
```typescript
import { createGitCommitExtension } from './extensions';

const ext = createGitCommitExtension({
  id: 'commit-1',
  commitHash: 'abc123',
  message: 'Add feature flag for new dashboard',
  author: 'alice@company.com',
  branch: 'feature/new-dashboard',
  filesChanged: 12,
  insertions: 340,
  deletions: 89,
  status: 'committed',
});
```

**Shows:**
- Commit hash (truncated)
- Message
- Files changed with +/- counts
- Author
- Status

#### Git Branches
```typescript
import { createGitBranchExtension } from './extensions';

const ext = createGitBranchExtension({
  id: 'branch-1',
  branchName: 'feature/mobile-app',
  baseBranch: 'main',
  status: 'created',
  commitsAhead: 5,
});
```

#### Git Diff
```typescript
import { createGitDiffExtension } from './extensions';

const ext = createGitDiffExtension({
  id: 'diff-1',
  files: [
    { path: 'src/api.ts', status: 'modified', additions: 50, deletions: 20 },
    { path: 'tests/api.test.ts', status: 'added', additions: 120, deletions: 0 },
    { path: 'README.md', status: 'modified', additions: 5, deletions: 2 },
  ],
  totalAdditions: 175,
  totalDeletions: 22,
  summary: '3 files changed (+175, -22)',
});
```

---

### **PULL REQUESTS & CODE REVIEW**

#### Pull Requests
```typescript
import { createPullRequestExtension } from './extensions';

const ext = createPullRequestExtension({
  id: 'pr-1',
  prNumber: 789,
  title: 'Add real-time notifications',
  status: 'in-review',
  sourceBranch: 'feature/notifications',
  targetBranch: 'main',
  url: 'https://github.com/company/repo/pull/789',
  author: 'alice@company.com',
  repository: 'company/repo',
  reviewers: ['bob@company.com', 'charlie@company.com'],
  commitCount: 7,
  filesChanged: 24,
  action: 'created',
});
```

**Real-time:**
- Reviews received → card updates approvals count
- Changes requested → status changes
- Comments → counter updates
- Ready to merge → status changes to "approved"

#### Code Reviews
```typescript
import { createCodeReviewExtension } from './extensions';

const ext = createCodeReviewExtension({
  id: 'review-1',
  reviewId: 'pr-789',
  status: 'in-progress',
  reviewerCount: 3,
  approvalsNeeded: 2,
  approvalsReceived: 1,
  filesReviewed: 8,
  totalFiles: 24,
  comments: 12,
  suggestedChanges: 3,
  url: 'https://github.com/company/repo/pull/789#reviews',
});
```

#### Code Comments
```typescript
import { createCodeCommentExtension } from './extensions';

const ext = createCodeCommentExtension({
  id: 'comment-1',
  commentId: 'c-456',
  author: 'bob@company.com',
  text: 'This function should handle edge cases better',
  file: 'src/api.ts',
  line: 42,
  status: 'pending',
  replies: 2,
  url: 'https://github.com/company/repo/pull/789#discussion_r456',
});
```

---

### **COMMUNICATION**

#### Slack Messages
```typescript
import { createSlackMessageExtension } from './extensions';

const ext = createSlackMessageExtension({
  id: 'slack-1',
  messageId: 'msg-123',
  channelName: 'engineering',
  text: 'The feature is ready for testing!',
  status: 'sent',
  reactions: 3,
  replies: 2,
  url: 'https://company.slack.com/archives/C123/p456',
});
```

#### Microsoft Teams
```typescript
import { createTeamsMessageExtension } from './extensions';

const ext = createTeamsMessageExtension({
  id: 'teams-1',
  messageId: 'msg-789',
  channelName: 'Development',
  text: '@channel The build passed!',
  status: 'sent',
  reactions: 5,
  replies: 1,
  url: 'https://teams.microsoft.com/l/message/...',
});
```

#### Email
```typescript
import { createEmailExtension } from './extensions';

const ext = createEmailExtension({
  id: 'email-1',
  messageId: 'eml-456',
  to: ['team@company.com', 'product@company.com'],
  cc: ['manager@company.com'],
  subject: 'Sprint Planning Agenda',
  preview: 'Next sprint planning is scheduled for Thursday...',
  status: 'sent',
  url: 'https://gmail.com/mail/u/0/#mail/FMf...',
});
```

#### Discord
```typescript
import { createDiscordMessageExtension } from './extensions';

const ext = createDiscordMessageExtension({
  id: 'discord-1',
  messageId: 'msg-321',
  channelName: 'dev-updates',
  text: 'Deployed to production',
  status: 'sent',
  reactions: 2,
  url: 'https://discord.com/channels/123/456/789',
});
```

---

### **MEETINGS & RECORDINGS**

#### Meetings
```typescript
import { createMeetingExtension } from './extensions';

const ext = createMeetingExtension({
  id: 'meeting-1',
  meetingId: 'zoom-123',
  title: 'Team Standup',
  status: 'recording',
  platform: 'zoom',
  participants: 8,
  duration: 1800, // seconds
  recordingUrl: 'https://zoom.us/recordings/...',
  url: 'https://zoom.us/j/123456789',
});
```

**Updates in real-time:**
- Recording status → "recording" → "recorded"
- Participants → updates as people join/leave
- Duration → keeps incrementing

#### Recordings
```typescript
import { createRecordingExtension } from './extensions';

const ext = createRecordingExtension({
  id: 'recording-1',
  recordingId: 'rec-456',
  title: 'Q4 Planning Meeting',
  platform: 'zoom',
  duration: 3600,
  status: 'processing',
  progress: 75, // Processing progress
  url: 'https://zoom.us/my/recordings/rec-456',
  transcriptionStatus: 'in-progress',
});
```

#### Transcriptions
```typescript
import { createTranscriptionExtension } from './extensions';

const ext = createTranscriptionExtension({
  id: 'transcription-1',
  transcriptionId: 'trans-789',
  title: 'Q4 Planning Meeting',
  status: 'in-progress',
  progress: 45,
  wordCount: 12500,
  summaryAvailable: false,
  url: 'https://fathom.video/transcript/trans-789',
});
```

#### Meeting Summaries
```typescript
import { createMeetingSummaryExtension } from './extensions';

const ext = createMeetingSummaryExtension({
  id: 'summary-1',
  meetingId: 'meeting-123',
  title: 'Q4 Planning',
  duration: 60, // minutes
  participants: ['alice@company.com', 'bob@company.com'],
  summary: 'Discussed Q4 goals, priorities, and timeline...',
  keyPoints: [
    'Need to focus on performance optimization',
    'Mobile app redesign starts next sprint',
    'API rate limiting needs implementation',
  ],
  actionItems: [
    { task: 'Create performance optimization RFC', owner: 'alice@company.com' },
    { task: 'Design mobile mockups', owner: 'bob@company.com' },
  ],
  url: 'https://company.fathom.video/share/123',
});
```

---

### **BUILD & DEPLOYMENT**

#### Builds
```typescript
import { createBuildExtension } from './extensions';

const ext = createBuildExtension({
  id: 'build-1',
  buildId: 'build-456',
  buildName: 'api-server',
  status: 'running',
  progress: 72,
  duration: 180, // seconds
  url: 'https://ci.company.com/jobs/456',
});
```

**Real-time updates:**
- Status: queued → running → passed/failed
- Progress bar increments
- Shows: "72% complete"

#### Deployments
```typescript
import { createDeploymentExtension } from './extensions';

const ext = createDeploymentExtension({
  id: 'deploy-1',
  deploymentId: 'deploy-789',
  service: 'api-server',
  environment: 'production',
  status: 'deploying',
  progress: 45,
  version: 'v1.2.3',
  url: 'https://deploy.company.com/123',
});
```

---

### **CALENDAR & SCHEDULING**

```typescript
import { createCalendarEventExtension } from './extensions';

const ext = createCalendarEventExtension({
  id: 'event-1',
  eventId: 'evt-123',
  title: 'Sprint Planning',
  startTime: 1630000000000,
  endTime: 1630003600000,
  status: 'accepted',
  attendees: ['alice@company.com', 'bob@company.com'],
  location: 'Conference Room B',
  url: 'https://calendar.google.com/calendar/u/0/r/eventedit/...',
});
```

---

### **FILE UPLOADS & CLOUD STORAGE**

```typescript
import { createFileUploadExtension } from './extensions';

const ext = createFileUploadExtension({
  id: 'upload-1',
  fileName: 'report-q4.pdf',
  fileSize: 2560000, // 2.5 MB
  status: 'uploading',
  progress: 87,
  platform: 'google-drive',
  url: 'https://drive.google.com/file/d/abc123',
});
```

---

### **PROJECTS & TASKS**

```typescript
import { createTaskExtension } from './extensions';

const ext = createTaskExtension({
  id: 'task-1',
  taskId: 'task-456',
  title: 'Implement OAuth2 authentication',
  status: 'in-progress',
  priority: 'high',
  assignee: 'alice@company.com',
  dueDate: 1630176000000,
  project: 'Platform API',
  action: 'created',
});
```

---

## **Integration Points in ConversationRuntime**

When you wire these into ConversationRuntime, extensions appear automatically:

```typescript
// Example: Creating a Jira ticket
const createTicketExtension = createJiraTicketExtension({
  // ... config
});

// Add to message
message.extensions = [createTicketExtension];

// As status changes, update extension
ext.status = 'in-progress';
ext.assignee = 'alice@company.com';

// Broadcast update
updateMessage(message);
```

---

## **Real-Time Synchronization**

Extensions update automatically when:

| Event | Extension Updates |
|-------|-------------------|
| PR created | PullRequestExtension appears |
| Reviewer approves | Status → "approved", counter updates |
| Changes requested | Status → "changes-requested" |
| Comment added | Comment count increments |
| PR merged | Status → "merged" |
| Build starts | BuildExtension appears, progress: 0% |
| Build progresses | Progress bar increments |
| Build passes | Status → "passed", show duration |
| Deploy starts | DeploymentExtension appears |
| Deploy completes | Status → "deployed" |
| Meeting ends | Meeting status → "recorded" |
| Transcription ready | TranscriptionExtension status → "complete" |
| Jira status changes | JiraTicketExtension status updates |
| Slack reaction added | Reactions counter increments |

---

## **Expand Behavior**

Every extension with a URL has an **↗** expand button. Click it to open in Browser:

```
[🔗 Jira Ticket] PROJ-123: Fix login
            assignee: alice | HIGH [↗]

Click ↗
  ↓
[Conversation Panel] | [Browser Card]
                      | PROJ-123 Details
                      | Comments: 8
                      | Activity timeline
                      | Full description
```

The Browser card stays in sync with inline updates.

---

## **Usage in Actions**

When the AI calls an action that creates/updates a platform resource:

```
User: "Open a PR with these changes"
  ↓
ConversationRuntime.handleToolCall('create_pull_request')
  ↓
PullRequestExtension created
  ↓
[Assistant] "Creating pull request..."
[🔀 Pull Request] #42: Add new feature
              2 reviewers | OPEN [↗]
  ↓
PR Status updates → card updates
Reviews come in → counter updates
Ready to merge → status changes
```

---

## **All Extensions Summary**

| Type | Display | Expand | Real-Time |
|------|---------|--------|-----------|
| Jira Ticket | 🔗 PROJ-123: Title | ↗ Browser | Status, assignee |
| Linear Ticket | 🎯 TEAM-42: Title | ↗ Browser | Status, priority |
| GitHub Issue | 🐙 #456: Title | ↗ Browser | Status, labels |
| Pull Request | 🔀 #789: Title | ↗ Browser | Status, reviews, comments |
| Code Review | 👁️ Review | ↗ Browser | Approvals, changes |
| Code Comment | 💬 "text..." | ↗ Browser | Replies |
| Git Commit | 📝 Message | ↗ WorkTree | — |
| Git Branch | 🌳 Branch name | ↗ WorkTree | — |
| Slack Message | 💬 #channel | ↗ Browser | Reactions, replies |
| Teams Message | 🏢 #channel | ↗ Browser | Reactions, replies |
| Email | 📧 Subject | ↗ Browser | — |
| Discord | 🎮 #channel | ↗ Browser | Reactions |
| Meeting | 📞 Title | ↗ Browser | Status, participants |
| Recording | 🎬 Title | ↗ Browser | Progress, transcription |
| Build | 🔨 Build name | ↗ Terminal | Progress, status |
| Deployment | 🚀 Service → env | ↗ Terminal | Progress, status |
| Calendar | 📅 Event title | ↗ Browser | Status |
| Task | ☐ Task title | ↗ Browser | Status, assignee |

---

## **Next Steps**

To activate all integrations, wire ConversationRuntime to:

1. **Jira/Linear/GitHub** — Hook action handlers to create extensions
2. **Git** — Hook commit/branch/PR handlers
3. **Slack/Teams/Email** — Hook send handlers  
4. **Meetings** — Hook recording/transcription events
5. **Build/Deploy** — Hook CI/CD webhooks
6. **Calendar** — Hook scheduling events

All the extension types and helpers are ready. Just add the wire-up!
