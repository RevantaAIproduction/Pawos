# PawOS Workspace Integration & Meeting Management API

Comprehensive backend infrastructure for workspace integrations (Mail, Slack, Drive, Calendar) and AI meeting management.

## Integration Handlers

### Connect Integration
**IPC Channel:** `integration:connect`

Connect a workspace service (Gmail, Slack, Google Drive, Google Calendar).

```typescript
ipc.integrationConnect(userId, {
  service: 'gmail' | 'slack' | 'googleDrive' | 'googleCalendar',
  accessToken: string,
  refreshToken?: string,
  email?: string,
  expiresAt?: number,
})
```

**Returns:** 
```typescript
{
  ok: boolean,
  reason?: string,
  connection?: IntegrationConnection
}
```

### Disconnect Integration
**IPC Channel:** `integration:disconnect`

Disconnect a workspace service.

```typescript
ipc.integrationDisconnect(userId, service)
```

### List Connections
**IPC Channel:** `integration:list`

Get all integration connections for a user.

```typescript
ipc.integrationList(userId)
```

**Returns:**
```typescript
{
  ok: boolean,
  connections: IntegrationConnection[]
}
```

### Get Integration Status
**IPC Channel:** `integration:status`

Get status of all integrated services.

```typescript
ipc.integrationStatus(userId)
```

**Returns:**
```typescript
IntegrationStatusInfo[] // Array of service statuses
```

### Refresh Integration Token
**IPC Channel:** `integration:refreshToken`

Refresh OAuth access token for a service.

```typescript
ipc.integrationRefreshToken(userId, service, newAccessToken, {
  refreshToken?: string,
  expiresAt?: number
})
```

---

## Meeting Handler (Pro+ Tier Only)

### Start Meeting Recording
**IPC Channel:** `meeting:record`
**Tier Gate:** Pro or higher

Start a new meeting recording.

```typescript
ipc.meetingRecord(userId, {
  meetingId: string,
  title: string,
  attendees?: string[]
})
```

**Returns:**
```typescript
{
  ok: boolean,
  reason?: string,
  recording?: MeetingRecording
}
```

### Generate Meeting Summary
**IPC Channel:** `meeting:summarize`
**Tier Gate:** Pro or higher

Generate AI summary from meeting recording.

```typescript
ipc.meetingSummarize(userId, {
  meetingId: string,
  recordingId?: string,
  transcriptText?: string,
  model?: string // AI model to use (default: paw-gemini)
})
```

**Returns:**
```typescript
{
  ok: boolean,
  reason?: string,
  summary?: MeetingSummary
}
```

### Distribute Meeting Summary
**IPC Channel:** `meeting:distribute`
**Tier Gate:** Pro or higher

Send meeting summary to selected recipients.

```typescript
ipc.meetingDistribute(userId, {
  meetingId: string,
  summaryId: string,
  recipients: string[], // email addresses
  method: 'all' | 'selected' | 'admin',
  message?: string,
  includeRecordingLink?: boolean
})
```

**Returns:**
```typescript
{
  ok: boolean,
  reason?: string,
  distributionId?: string,
  sentTo?: string[],
  failed?: string[]
}
```

### List Meetings
**IPC Channel:** `meeting:list`

List meetings with optional filtering.

```typescript
ipc.meetingList(userId, {
  limit?: number,
  offset?: number,
  status?: 'scheduled' | 'in-progress' | 'completed' | 'cancelled',
  hasRecording?: boolean,
  hasSummary?: boolean
})
```

**Returns:**
```typescript
{
  ok: boolean,
  meetings: Meeting[],
  total: number
}
```

### Get Meeting Details
**IPC Channel:** `meeting:get`

Get a specific meeting by ID.

```typescript
ipc.meetingGet(meetingId)
```

### Update Meeting Status
**IPC Channel:** `meeting:updateStatus`

Update meeting status.

```typescript
ipc.meetingUpdateStatus(meetingId, status)
```

### Add Attendee to Meeting
**IPC Channel:** `meeting:addAttendee`

Add an attendee to a meeting.

```typescript
ipc.meetingAddAttendee(meetingId, {
  email: string,
  name?: string,
  joinedAt?: number,
  leftAt?: number
})
```

---

## Background Tasks API

### Start Task
**IPC Channel:** `task:start`

Start a new background task.

```typescript
ipc.taskStart(
  type: 'meeting_recording' | 'meeting_summarization' | 'meeting_distribution' | 'integration_sync' | 'data_export' | 'other',
  title: string,
  command: string,
  metadata?: Record<string, unknown>
)
```

**Returns:**
```typescript
{
  ok: boolean,
  taskId?: string,
  reason?: string
}
```

### Update Task Progress
**IPC Channel:** `task:updateProgress`

Update progress of a running task.

```typescript
ipc.taskUpdateProgress(taskId, progress, output?)
```

### Complete Task
**IPC Channel:** `task:complete`

Mark a task as completed or failed.

```typescript
ipc.taskComplete(taskId, error?)
```

### Cancel Task
**IPC Channel:** `task:cancel`

Cancel a running task.

```typescript
ipc.taskCancel(taskId)
```

### Get Task Details
**IPC Channel:** `task:get`

Get task with its logs.

```typescript
ipc.taskGet(taskId)
```

**Returns:**
```typescript
{
  ok: boolean,
  task?: BackgroundTask,
  logs?: TaskLogEntry[]
}
```

### List Tasks
**IPC Channel:** `task:list`

List tasks with filtering and sorting.

```typescript
ipc.taskList({
  limit?: number,
  offset?: number,
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  type?: TaskType,
  sortBy?: 'startedAt' | 'finishedAt',
  sortOrder?: 'asc' | 'desc'
})
```

### Get Task Logs
**IPC Channel:** `task:getLogs`

Get logs for a specific task.

```typescript
ipc.taskGetLogs(taskId, limit?)
```

### Clear Old Tasks
**IPC Channel:** `task:clearOld`

Clear tasks older than specified days.

```typescript
ipc.taskClearOld(olderThanDays)
```

---

## Service Classes

### IntegrationService
Higher-level interface for integration management.

```typescript
import { IntegrationService } from '../workspace/services/IntegrationService';

// List all connections
IntegrationService.listConnections(userId);

// Get status
IntegrationService.getStatus(userId);

// Check if connected
IntegrationService.isConnected(userId, 'googleCalendar');

// Get connection
IntegrationService.getConnection(userId, 'gmail');

// Get access token (with auto-refresh)
await IntegrationService.getAccessToken(userId, 'slack');

// Disconnect
IntegrationService.disconnect(userId, 'googleDrive');

// Connect
IntegrationService.connect(userId, 'googleCalendar', accessToken, {
  refreshToken,
  expiresAt,
  email
});
```

### MeetingService
Higher-level interface for meeting management.

```typescript
import { MeetingService } from '../workspace/services/MeetingService';

// Start recording
await MeetingService.startRecording(userId, request);

// Stop recording
await MeetingService.stopRecording(meetingId);

// Generate summary
await MeetingService.generateSummary(userId, request);

// Distribute summary
await MeetingService.distributeSummary(userId, request);

// List meetings
MeetingService.listMeetings(userId, query);

// Get meeting
MeetingService.getMeeting(meetingId);

// Add attendee
MeetingService.addAttendee(meetingId, attendee);

// Sync with calendar
await MeetingService.syncWithCalendar(meetingId, calendarEventId);

// Join meeting
await MeetingService.joinMeeting(meetingLink, attendeeEmail);
```

### TaskLogService
Service for background task management.

```typescript
import { TaskLogService } from '../workspace/services/TaskLogService';

// Start task
TaskLogService.startTask(type, title, command, metadata);

// Update progress
TaskLogService.updateProgress(taskId, progress, output);

// Complete task
TaskLogService.completeTask(taskId, error);

// Cancel task
TaskLogService.cancelTask(taskId);

// Get task
TaskLogService.getTask(taskId);

// List tasks
TaskLogService.listTasks(query);

// Get task logs
TaskLogService.getTaskLogs(taskId, limit);

// Log message
TaskLogService.log(taskId, message, level, context);

// Get statistics
TaskLogService.getStats();

// Clear old tasks
TaskLogService.clearOld(olderThanDays);
```

### MeetingIntegration
Helper for calendar operations.

```typescript
import { MeetingIntegration } from '../workspace/integrations/MeetingIntegration';

// Create calendar event
await MeetingIntegration.createCalendarEvent(userId, eventDraft);

// List upcoming meetings
await MeetingIntegration.listUpcomingMeetings(userId, withinDays);

// Find free slots
await MeetingIntegration.findFreeSlots(userId, attendees, durationMinutes, withinDays);

// Reschedule event
await MeetingIntegration.rescheduleEvent(userId, eventId, startsAt, endsAt);

// Check if calendar connected
MeetingIntegration.isCalendarConnected(userId);
```

---

## Types

### Workspace Integration Types
See `src/shared/workspace/IntegrationTypes.ts`

```typescript
type IntegrationServiceType = 'gmail' | 'slack' | 'googleDrive' | 'googleCalendar';
type IntegrationStatus = 'connected' | 'disconnected' | 'error';

interface IntegrationConnection {
  id: string;
  userId: string;
  service: IntegrationServiceType;
  status: IntegrationStatus;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  connectedAt: number;
  disconnectedAt?: number;
  error?: string;
}
```

### Meeting Types
See `src/shared/workspace/MeetingTypes.ts`

```typescript
interface Meeting {
  id: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  startedAt?: number;
  endedAt?: number;
  duration?: number;
  attendees: MeetingAttendee[];
  organizer: MeetingAttendee;
  recording?: MeetingRecording;
  summary?: MeetingSummary;
  calendarEventId?: string;
  meetingLink?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Background Task Types
See `src/shared/workspace/BackgroundTaskTypes.ts`

```typescript
interface BackgroundTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  description?: string;
  command: string;
  progress: number; // 0-100
  output: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}
```

---

## Tier Gating

Meeting Assistant features are gated to Pro+ tier:
- `meeting:record` - requires `meetingAssistant` feature
- `meeting:summarize` - requires `meetingAssistant` feature
- `meeting:distribute` - requires `meetingAssistant` feature

Tier checks are performed in IPC handlers via `entitlementService.isFeatureAvailable('meetingAssistant')`.

---

## Integration Points

### With Existing Systems

1. **EntitlementService** - Tier gating for Pro+ features
2. **EmailService** - For distributing meeting summaries
3. **GoogleCalendarConnector** - For calendar sync and event creation
4. **OfficeConnectorRegistry** - For retrieving active integrations
5. **ConversationSessionStore** - For logging meeting-related turns
6. **PlatformEventBus** - For tracking integration events

### With AI Providers

Meeting summarization integrates with configured AI provider (default: Gemini):
- Uses existing AI provider configuration from AIProviderConfigStore
- Supports custom model selection via `model` parameter
- Fallback to default model if not specified

---

## Usage Examples

### Connect Google Calendar
```typescript
const result = await ipc.integrationConnect(userId, {
  service: 'googleCalendar',
  accessToken: oauthToken.access_token,
  refreshToken: oauthToken.refresh_token,
  expiresAt: oauthToken.expires_at,
  email: userEmail
});

if (result.ok) {
  console.log('Google Calendar connected:', result.connection);
}
```

### Start Meeting Recording & Generate Summary
```typescript
// Start recording
const recording = await ipc.meetingRecord(userId, {
  meetingId: 'meeting-123',
  title: 'Q3 Planning',
  attendees: ['john@example.com', 'jane@example.com']
});

if (!recording.ok) return;

// ... recording happens ...

// Generate summary
const summary = await ipc.meetingSummarize(userId, {
  meetingId: 'meeting-123',
  recordingId: recording.recording.id,
  model: 'paw-gemini'
});

if (!summary.ok) return;

// Distribute to attendees
const distribution = await ipc.meetingDistribute(userId, {
  meetingId: 'meeting-123',
  summaryId: summary.summary.id,
  recipients: ['john@example.com', 'jane@example.com'],
  method: 'selected',
  message: 'Here is the meeting summary'
});
```

### Track Background Task Progress
```typescript
// Start task
const taskStart = await ipc.taskStart(
  'meeting_recording',
  'Recording Q3 Planning Meeting',
  'record-meeting meeting-123'
);

const taskId = taskStart.taskId;

// Update progress
await ipc.taskUpdateProgress(taskId, 25, 'Initializing recording...');
await ipc.taskUpdateProgress(taskId, 50, 'Recording in progress...');
await ipc.taskUpdateProgress(taskId, 100, 'Recording complete');

// Complete task
await ipc.taskComplete(taskId);

// Get task details
const details = await ipc.taskGet(taskId);
console.log(details.task);
console.log(details.logs);
```

---

## File Structure

```
src/main/
├── ipc/
│   └── handlers/
│       ├── integrationHandler.ts     # Integration connection management
│       ├── meetingHandler.ts          # Meeting recording/summarization
│       └── backgroundTasksHandler.ts  # Task tracking
├── workspace/
│   ├── services/
│   │   ├── IntegrationService.ts     # High-level integration interface
│   │   ├── MeetingService.ts         # High-level meeting interface
│   │   └── TaskLogService.ts         # High-level task management
│   └── integrations/
│       └── MeetingIntegration.ts     # Calendar integration helper

src/shared/workspace/
├── IntegrationTypes.ts               # Integration type definitions
├── MeetingTypes.ts                   # Meeting type definitions
└── BackgroundTaskTypes.ts            # Task type definitions

src/renderer/services/ipc/
├── ipcBridgeImplementation.ts        # Renderer-side IPC methods
└── ipcTypes.ts                       # Renderer-side type imports
```
