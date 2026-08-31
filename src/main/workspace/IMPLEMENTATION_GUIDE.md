# PawOS Workspace Integration Backend - Implementation Guide

## Overview

This guide explains the new comprehensive backend infrastructure for workspace integrations and AI meeting management. The implementation follows the critical path:

1. **IPC Handlers** - Handle all main<->renderer communication
2. **Type Definitions** - Shared types across main and renderer
3. **Service Classes** - High-level business logic wrappers
4. **IPC Bridge Updates** - Renderer-side integration

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                         │
│  (UI Components -> ipcBridgeImplementation -> IPC channels) │
└─────────────────────────────────────────────────────────────┘
                              ↓ IPC
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
│  IPC Handlers -> Service Classes -> Business Logic          │
└─────────────────────────────────────────────────────────────┘
```

### Layer Breakdown

#### 1. Renderer Layer (Frontend)
- UI components call `ipc.<method>()` from `ipcBridgeImplementation`
- All calls are async and return promises
- No backend logic, only UI state management

#### 2. IPC Handler Layer (Bridge)
- Located in `src/main/ipc/handlers/`
- Direct connection to main process via Electron IPC
- Minimal logic - mostly delegates to services
- Examples:
  - `integrationHandler.ts` - Integration connection/status
  - `meetingHandler.ts` - Meeting recording/summarization
  - `backgroundTasksHandler.ts` - Task tracking

#### 3. Service Layer (Business Logic)
- Located in `src/main/workspace/services/`
- High-level interfaces for complex operations
- Coordinates between handlers and external services
- Examples:
  - `IntegrationService` - OAuth token management
  - `MeetingService` - Recording/summarization workflow
  - `TaskLogService` - Task lifecycle management

#### 4. Integration Layer (External Services)
- Located in `src/main/workspace/integrations/`
- Bridges to external services (Google Calendar, email, etc.)
- Example: `MeetingIntegration` - Calendar operations

## Current Implementation Status

### Completed

✅ **Type Definitions**
- `IntegrationTypes.ts` - Service connections, status
- `MeetingTypes.ts` - Recording, summary, distribution
- `BackgroundTaskTypes.ts` - Task tracking and logs

✅ **IPC Handlers**
- `integrationHandler.ts` - Connect/disconnect/status/refresh
- `meetingHandler.ts` - Record/summarize/distribute/list
- `backgroundTasksHandler.ts` - Start/update/complete/cancel tasks

✅ **Service Classes**
- `IntegrationService` - High-level connection management
- `MeetingService` - High-level meeting operations
- `TaskLogService` - High-level task management

✅ **IPC Bridge Updates**
- Updated `ipcBridgeImplementation.ts` with 28 new methods
- Updated `bridgeImpl.ts` preload with handlers
- Updated `ipcTypes.ts` with workspace type imports

✅ **Integration Helpers**
- `MeetingIntegration.ts` - Calendar operations bridge

✅ **IPC Registration**
- Added 26 new ipcMain.handle() calls in `ipc.ts`
- Tier gating for Pro+ features (meetingAssistant)

### Next Steps (Not Yet Implemented)

⏳ **Database Persistence**
- Replace in-memory stores with SQLite database
- Create migrations for meetings, summaries, integrations, tasks
- Add connection pooling and query optimization

⏳ **AI Integration**
- Integrate with existing AI provider for meeting summarization
- Implement transcript generation from recordings
- Add action item extraction and decision tracking

⏳ **Email Distribution**
- Integrate with existing emailService for summary distribution
- Add recipient preferences and opt-out management
- Implement batch sending with retry logic

⏳ **Google Meet/Zoom/Teams Integration**
- Implement meeting join/leave lifecycle
- Add recording initiation directly from meeting platform
- Implement live transcript capture

⏳ **Error Handling & Logging**
- Add comprehensive error tracking to PlatformEventBus
- Implement retry logic for failed operations
- Add user-facing error messages

⏳ **Performance Optimization**
- Add caching for integration tokens
- Implement background sync for calendar events
- Add rate limiting for API calls

## How to Use

### From React Components

```typescript
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

// Connect a service
const result = await ipc.integrationConnect(userId, {
  service: 'googleCalendar',
  accessToken: token,
  email: userEmail
});

// Start meeting recording
const recording = await ipc.meetingRecord(userId, {
  meetingId: 'meeting-123',
  title: 'Team Standup',
  attendees: ['john@example.com']
});

// Generate summary
const summary = await ipc.meetingSummarize(userId, {
  meetingId: 'meeting-123'
});

// Track background task
const taskStart = await ipc.taskStart('meeting_recording', 'Recording...');
```

### From Service Code (Main Process)

```typescript
import { IntegrationService } from '../workspace/services/IntegrationService';
import { MeetingService } from '../workspace/services/MeetingService';
import { TaskLogService } from '../workspace/services/TaskLogService';

// Check integration status
const isConnected = IntegrationService.isConnected(userId, 'gmail');
const token = await IntegrationService.getAccessToken(userId, 'slack');

// Start meeting workflow
const meeting = await MeetingService.startRecording(userId, {
  meetingId: 'meeting-123',
  title: 'Q3 Planning'
});

// Manage background tasks
const taskId = TaskLogService.startTask(
  'meeting_summarization',
  'Generating summary...',
  'summarize-meeting-123'
);
TaskLogService.updateProgress(taskId, 50, 'Processing transcript...');
TaskLogService.completeTask(taskId);
```

## Tier Gating

Meeting Assistant features require Pro+ tier:

```typescript
// In ipc.ts - these gates are enforced:
ipcMain.handle('meeting:record', (_evt, userId, request) => {
  if (!entitlementService.isFeatureAvailable('meetingAssistant')) {
    return { ok: false, reason: 'Meeting Assistant requires Pro or higher tier' };
  }
  // ... proceed with recording
});
```

Supported tiers:
- **Go (Free)** - No meeting assistant
- **Pro ($20/month)** - Full meeting assistant access
- **Pro Max ($100/month)** - Full meeting assistant + advanced features
- **Team/Enterprise** - Full features with seat billing

## Data Flow Example: Recording & Summarizing a Meeting

### Step 1: Frontend Initiates Recording
```
React Component
  → ipc.meetingRecord(userId, {meetingId, title, attendees})
  → ipc.taskStart('meeting_recording', title, command)
```

### Step 2: Backend Handles Recording
```
ipcMain.handle('meeting:record')
  → entitlementService.isFeatureAvailable('meetingAssistant') ✓
  → recordMeeting(userId, request)
  → taskStart() creates background task
  → updateMeetingStatus('in-progress')
  → returns MeetingRecording with ID
```

### Step 3: Frontend Updates Progress
```
React Component (monitoring recording)
  → ipc.taskUpdateProgress(taskId, progress, output)
  → ipc.meetingGet(meetingId) to refresh state
```

### Step 4: Recording Complete
```
React Component
  → ipc.meetingUpdateStatus(meetingId, 'completed')
  → ipc.taskComplete(taskId)
```

### Step 5: Generate Summary
```
React Component
  → ipc.meetingSummarize(userId, {meetingId})
  → ipc.taskStart('meeting_summarization', ...)
```

### Step 6: Backend Generates Summary
```
ipcMain.handle('meeting:summarize')
  → entitlementService.isFeatureAvailable('meetingAssistant') ✓
  → summarizeMeeting() calls AI provider
  → generates keyPoints, actionItems, decisions
  → saves to meetingSummaryStore
  → returns MeetingSummary
```

### Step 7: Distribute Summary
```
React Component
  → ipc.meetingDistribute(userId, {meetingId, recipients})
  → ipc.taskStart('meeting_distribution', ...)
```

### Step 8: Backend Distributes
```
ipcMain.handle('meeting:distribute')
  → entitlementService.isFeatureAvailable('meetingAssistant') ✓
  → distributeMeetingSummary() sends emails via emailService
  → taskLogEvent() tracks sent recipients
  → returns distribution report
```

## Testing

### Manual Testing Checklist

```
Integration Management:
□ Connect Gmail - check token saved
□ Connect Slack - verify disconnection
□ Get integration status - verify all services listed
□ Refresh token - verify new token applied
□ Mark integration as error - check error message

Meeting Features (Pro+ only):
□ Start recording - verify meeting created
□ Add attendee - verify attendee list updated
□ Generate summary - verify summary content
□ Distribute summary - verify recipients listed
□ List meetings - verify pagination works
□ Update meeting status - verify status changed

Background Tasks:
□ Start task - verify task ID generated
□ Update progress - verify progress increments
□ Complete task - verify finished time set
□ Get task logs - verify logs populated
□ Cancel task - verify status changed
□ List tasks - verify filtering works
□ Clear old tasks - verify old tasks removed
```

### Testing Tier Gating

```typescript
// Test that Pro+ gate works:
// 1. Set subscription tier to 'go'
// 2. Call ipc.meetingRecord(userId, request)
// 3. Should return: { ok: false, reason: 'Meeting Assistant requires Pro or higher tier' }

// 4. Set subscription tier to 'pro'
// 5. Call same method
// 6. Should return: { ok: true, recording: {...} }
```

## Performance Considerations

### Current Limitations (In-Memory Storage)

The current implementation uses in-memory Maps for storage:
- ❌ Data lost on process restart
- ❌ Not shared between windows
- ❌ Memory usage grows unbounded
- ❌ No persistence

### Transition to SQLite

When moving to SQLite:

```typescript
// Replace integrationStore Map with database queries
const connection = await db.query(
  'SELECT * FROM integration_connections WHERE user_id = ? AND service = ?',
  [userId, service]
);

// Add indexes for common queries
CREATE INDEX idx_integrations_user_service ON integration_connections(user_id, service);
CREATE INDEX idx_meetings_organizer ON meetings(organizer_email);
CREATE INDEX idx_tasks_status ON background_tasks(status);
```

### Optimization Opportunities

1. **Token Caching** - Cache valid tokens with TTL
2. **Batch Distribution** - Group email sends
3. **Lazy Loading** - Paginate task logs
4. **Compression** - Compress old task logs
5. **Indexing** - Add DB indexes for common queries

## Integration with Existing Systems

### EntitlementService
- Used for tier gating Pro+ features
- Called in every meeting: handler

### EmailService
- Used for distributing meeting summaries
- Will be integrated in real implementation

### GoogleCalendarConnector
- Already implemented in office/google/
- Used by MeetingIntegration for calendar sync

### OfficeConnectorRegistry
- Already implemented
- Coordinates all office providers

### PlatformEventBus
- For error tracking and events
- Opportunities to log integration state changes

### AIProviderConfigStore
- Needed for meeting summarization
- Currently a stub in handlers

## Common Patterns

### Adding a New Integration Service

1. Add to `IntegrationServiceType` union in `IntegrationTypes.ts`
2. Add handler in `integrationHandler.ts`
3. Create service wrapper in `IntegrationService`
4. Add OAuth flow in main.ts
5. Add IPC method in ipcBridgeImplementation.ts
6. Export from bridgeImpl.ts preload

### Adding a New Task Type

1. Add to `TaskType` union in `BackgroundTaskTypes.ts`
2. Call `startTask()` with new type
3. Use `TaskLogService.log()` for logging
4. Call `completeTask()` when done
5. Optionally add to UI task dashboard

## Documentation

- API Endpoints: See `API_ENDPOINTS.md`
- Type Reference: See individual type files in `src/shared/workspace/`
- Handler Implementation: See `src/main/ipc/handlers/`
- Service Implementation: See `src/main/workspace/services/`

## Next Implementation Phase

1. **Database Schema** - Create SQLite migrations
2. **Persistence Layer** - Replace in-memory stores
3. **AI Integration** - Hook up meeting summarization
4. **Email Distribution** - Implement email sending
5. **Error Tracking** - Add comprehensive logging
6. **Frontend Components** - Build UI for all features
7. **Testing** - Add unit and integration tests
