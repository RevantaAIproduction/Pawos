# Meeting Assistant - Complete Flow Documentation

## Overview

The Meeting Assistant feature enables automatic meeting recording with 2-minute pre-meeting notifications. Users approve meetings using their own Google credentials, and summaries are automatically generated and displayed across three surfaces simultaneously.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User's Machine                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ CalendarPollingService (Main Process)                    │  │
│  │ - Polls Google Calendar every 30-60 seconds             │  │
│  │ - Detects meetings starting in ~2 minutes               │  │
│  │ - Sends PreMeetingNotification to renderer              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Renderer (Browser Tab)                                   │  │
│  │ - Shows pre-meeting modal: "[Meeting] starts in 2min"   │  │
│  │ - Approve/Deny buttons                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓ (User clicks Approve)             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Main Process: joinAndRecordMeeting()                     │  │
│  │ - Uses user's Google credentials (NOT PawOS account)     │  │
│  │ - Opens meeting link in browser                          │  │
│  │ - Starts recording (audio/screen capture)                │  │
│  │ - Tracks attendees and meeting duration                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓ (User leaves meeting)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ completeMeetingRecording()                               │  │
│  │ - Stops recording, saves to local storage                │  │
│  │ - Calculates total duration                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ summarizeMeeting()                                        │  │
│  │ - Passes recording to AI provider (Gemini)               │  │
│  │ - Generates: keyPoints, actionItems, decisions           │  │
│  │ - Creates MeetingSummary object                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ broadcastMeetingSummary() - Three-Surface Display        │  │
│  └──────────────────────────────────────────────────────────┘  │
│           ↓                      ↓                   ↓          │
│  ┌──────────────┐  ┌──────────────────────┐  ┌───────────┐   │
│  │ Conversation │  │ Browser Tab          │  │ Work      │   │
│  │ Panel        │  │ (Right Sidebar)      │  │ History   │   │
│  │              │  │                      │  │ (Left     │   │
│  │ Shows:       │  │ Shows:               │  │ Sidebar)  │   │
│  │ - Meeting    │  │ - Meeting summary    │  │           │   │
│  │   card/msg   │  │ - Recording link     │  │ Recent    │   │
│  │ - Summary    │  │ - Distribution opts  │  │ meetings  │   │
│  │ - "Send to   │  │                      │  │ listed as │   │
│  │   All" btn   │  │                      │  │ activity  │   │
│  │ - "Select    │  │                      │  │ in exec   │   │
│  │   Users" btn │  │                      │  │ history   │   │
│  └──────────────┘  └──────────────────────┘  └───────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Complete Timeline

### Phase 1: Calendar Polling (Continuous)

```
Time: Every 30-60 seconds
┌────────────────────────────────────────┐
│ calendarPollingService.startPolling()  │
│ (started when user enables meetings)   │
└────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────────────┐
│ MeetingIntegration.listUpcomingMeetings()                  │
│ - Fetches next 15 minutes from Google Calendar              │
│ - Checks each meeting's start time                          │
└────────────────────────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────────────┐
│ Detect: Meeting starting in ~2 min (within 90s to 30s)     │
│ - TimeUntilMeeting = meetingStart - now                     │
│ - If: 2min - 90s < time < 2min + 30s → NOTIFY              │
│ - Mark eventId as notified (prevent duplicates)             │
└────────────────────────────────────────────────────────────┘
           ↓
┌────────────────────────────────────────────────────────────┐
│ sendPreMeetingNotification()                               │
│ - Sends to all windows: meeting:preNotification             │
│ {                                                            │
│   eventId: string,                                           │
│   title: "[Meeting Name]",                                  │
│   attendees: ["user@example.com"],                          │
│   startsAt: "2026-08-28T14:32:00Z",                         │
│   meetingLink: "https://meet.google.com/abc-def-ghi"        │
│ }                                                            │
└────────────────────────────────────────────────────────────┘
```

### Phase 2: Pre-Meeting Modal (User Interaction)

```
┌─────────────────────────────────────────────┐
│ Renderer: onPreMeetingNotification listener  │
│                                              │
│ Shows modal:                                 │
│ ┌──────────────────────────────────────┐   │
│ │ [Meeting Name] starts in 2 minutes   │   │
│ │                                      │   │
│ │ Attendees: john@example.com, ...    │   │
│ │                                      │   │
│ │ [Allow PawOS to Join & Record]      │   │
│ │ [Deny]                               │   │
│ └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
           ↓ (User clicks Allow)
┌──────────────────────────────────────────────────────┐
│ ipc.meetingApprovePreNotification(eventId, ...)      │
│ - User approved meeting recording                     │
│ - Prepare to join meeting                             │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ ipc.meetingJoinAndRecord(userId, userEmail, link)    │
│ - Uses user's Google credentials                      │
│ - NOT PawOS account - user joins as themselves        │
└──────────────────────────────────────────────────────┘
```

### Phase 3: Recording (Active)

```
┌────────────────────────────────────────────┐
│ Main: joinAndRecordMeeting()                │
├────────────────────────────────────────────┤
│                                             │
│ 1. Create Meeting record:                   │
│    - meetingId, title, status='in-progress'│
│    - startedAt, attendees=[{email, name}]  │
│    - meetingLink, organizer                │
│                                             │
│ 2. Create Recording record:                 │
│    - recordingId, URL, mimeType             │
│    - duration=0 (will update)               │
│    - createdAt                              │
│                                             │
│ 3. Store meeting in meetingStore            │
│                                             │
│ Return: { ok: true, meetingId }             │
└────────────────────────────────────────────┘
     ↓ (Recording progresses in browser)
┌────────────────────────────────────────────┐
│ Renderer: Recording active                  │
│ - getUserMedia() / desktopCapturer()        │
│ - MediaRecorder captures audio/video        │
│ - Sends chunks to main process via IPC      │
│ - Tracks recording duration                 │
└────────────────────────────────────────────┘
     ↓ (User leaves meeting)
┌────────────────────────────────────────────┐
│ ipc.meetingCompleteRecording(meetingId)     │
│ - Stops recording                           │
│ - Updates status='completed'                │
│ - Calculates duration                       │
│ - Saves final recording file                │
└────────────────────────────────────────────┘
```

### Phase 4: Summarization

```
┌──────────────────────────────────────────────────────┐
│ Renderer: meetingSummarize() request                 │
│ - Sends recordingId or transcriptText                │
│ - Specifies AI model (default: paw-gemini)           │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ Main: summarizeMeeting()                             │
│                                                      │
│ 1. Task tracking:                                    │
│    taskId = startTask('meeting_summarization')       │
│    logTaskEvent(taskId, 'info', 'Processing ...')   │
│                                                      │
│ 2. AI Processing (via AIProviderConfigStore):        │
│    - Send recording/transcript to Gemini API         │
│    - Extract: keyPoints[], actionItems[], decisions[]│
│    - Generate structured summary                     │
│                                                      │
│ 3. Create MeetingSummary:                            │
│    {                                                 │
│      id, meetingId,                                  │
│      content: "AI-generated summary text",           │
│      keyPoints: ["Point 1", "Point 2"],              │
│      actionItems: ["TODO: ...", "TODO: ..."],        │
│      decisions: ["Decided: ..."],                    │
│      generatedAt: now,                               │
│      generatedBy: "paw-gemini"                       │
│    }                                                 │
│                                                      │
│ 4. Store in meeting:                                 │
│    meeting.summary = summaryObject                   │
│    meeting.status = 'completed'                      │
│                                                      │
│ 5. Task completion:                                  │
│    logTaskEvent(taskId, 'info', 'Done')             │
│    completeTask(taskId)                              │
└──────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────┐
│ Return to renderer:                                  │
│ { ok: true, summary: {...} }                         │
└──────────────────────────────────────────────────────┘
```

### Phase 5: Three-Surface Display

```
Main: broadcastMeetingSummary(meeting, userId)
│
├─ Prepare summaryData:
│  {
│    meetingId, title, attendees, summary,
│    recordingUrl, meetingLink, duration
│  }
│
├─ Broadcast to all windows: meeting:summaryGenerated
│  ├─> Window 1 (receives event)
│  ├─> Window 2 (receives event)
│  └─> Window N (receives event)
│
└─ Create ExecutionRecord for work history:
   {
     id: "meeting-{meetingId}",
     goal: "Record and summarize: [Title]",
     status: "completed",
     startedAt, completedAt, durationMs,
     applicationsUsed: ["Google Meet", "Google Calendar"],
     aiWorkersUsed: ["meeting-assistant"],
     commandsExecuted: ["record-meeting", "summarize-meeting"],
     timeline: [
       { type: "meeting-record", ok: true, ... },
       { type: "meeting-summarize", ok: true, ... }
     ],
     summary: meeting.summary.content,
     userId
   }
   └─ Broadcast: execution:recordMeetingSummary
      └─> Sent to all windows for work history display
```

### Surface 1: Conversation Panel

```
Renderer receives: meeting:summaryGenerated

Components:
┌─────────────────────────────────────────┐
│ Meeting Summary Card (ConversationPanel)│
├─────────────────────────────────────────┤
│                                          │
│ 📹 Q3 Planning Meeting                  │
│    Recorded on Aug 28, 2:30 PM           │
│    Duration: 45 minutes                  │
│                                          │
│ Attendees:                               │
│ • john@example.com • jane@example.com    │
│                                          │
│ Summary:                                 │
│ Team discussed Q3 roadmap and timeline.  │
│ Agreed on 3 major initiatives.           │
│                                          │
│ Key Points:                              │
│ • Initiative A - Priority 1              │
│ • Initiative B - Priority 2              │
│ • Timeline: Aug-Oct                      │
│                                          │
│ Action Items:                            │
│ □ John: Prepare detailed specs           │
│ □ Jane: Create test plan                 │
│                                          │
│ Decisions:                               │
│ • Approved Q3 budget                     │
│ • Set weekly check-ins                   │
│                                          │
│ [📧 Send to All] [👥 Select Users]      │
│                                          │
│ [🎙️ Listen to Recording]                │
│ [⬇️ Download Recording]                 │
│                                          │
└─────────────────────────────────────────┘
```

### Surface 2: Browser Tab (Right Sidebar)

```
Renderer receives: meeting:summaryGenerated

Section: "Meeting Summary" (Browser Tab)
┌──────────────────────────────────────┐
│ Browser Tab                          │
│                                      │
│ Meeting Summary                      │
│ ──────────────────                   │
│                                      │
│ Recent Meetings:                     │
│ • Q3 Planning (Aug 28)               │
│   ├─ 45 min recording                │
│   ├─ 5 attendees                     │
│   ├─ Summary available               │
│   └─ [View] [Share]                  │
│                                      │
│ • Sprint Planning (Aug 27)           │
│   ├─ 30 min recording                │
│   ├─ 3 attendees                     │
│   ├─ Summary available               │
│   └─ [View] [Share]                  │
│                                      │
│ • Team Sync (Aug 26)                 │
│   ├─ 20 min recording                │
│   ├─ 8 attendees                     │
│   ├─ Summary available               │
│   └─ [View] [Share]                  │
│                                      │
└──────────────────────────────────────┘
```

### Surface 3: Work History (Left Sidebar)

```
Renderer receives: execution:recordMeetingSummary

Section: "Recent Activity" (Dashboard Left Sidebar)
┌──────────────────────────────────────┐
│ Work History                         │
│                                      │
│ Today                                │
│ • 📹 Record and summarize:           │
│      Q3 Planning Meeting             │
│      2:30 PM • 45 min                │
│      Status: Completed ✓             │
│      AI Workers: meeting-assistant   │
│                                      │
│ • 🔧 Deploy v2.1.0 to staging        │
│      1:15 PM • 8 min                 │
│      Status: Completed ✓             │
│                                      │
│ • 📝 Update documentation            │
│      12:00 PM • 22 min               │
│      Status: Completed ✓             │
│                                      │
│ Yesterday                            │
│ • 📹 Record and summarize:           │
│      Sprint Planning Meeting         │
│      3:00 PM • 30 min                │
│      Status: Completed ✓             │
│                                      │
└──────────────────────────────────────┘
```

## IPC API Reference

### Calendar Polling

**Start Calendar Polling**
```typescript
ipc.meetingStartCalendarPolling(userId)
```
- Begins polling Google Calendar every 30-60 seconds
- Pro+ tier required
- Should be called on Dashboard load if user has Pro tier

**Stop Calendar Polling**
```typescript
ipc.meetingStopCalendarPolling()
```
- Stops polling
- Should be called on sign-out or tier downgrade

### Pre-Meeting Notification

**Listen for Pre-Meeting Notifications**
```typescript
ipc.onPreMeetingNotification((notification) => {
  // notification: { eventId, title, attendees, startsAt, meetingLink }
  // Show modal or notification UI
})
```

**Handle User Approval**
```typescript
ipc.meetingApprovePreNotification(eventId, meetingLink, userEmail)
// Then:
ipc.meetingJoinAndRecord(userId, userEmail, meetingLink, meetingTitle)
```

**Handle User Denial**
```typescript
ipc.meetingDenyPreNotification(eventId)
```

### Recording

**Complete Meeting Recording**
```typescript
ipc.meetingCompleteRecording(meetingId, durationSeconds)
```

### Summarization

**Generate Summary**
```typescript
ipc.meetingSummarize(userId, { meetingId, recordingId, model })
```

### Dual/Triple Display

**Listen for Summary Generated (All Three Surfaces)**
```typescript
ipc.onMeetingSummaryGenerated((summaryData) => {
  // summaryData includes full meeting + summary details
  // Display in conversation panel
  // Display in browser tab
})

ipc.onMeetingSummaryRecordedInHistory((executionRecord) => {
  // executionRecord represents meeting in work history
  // Display in left sidebar recent activity
})
```

## Tier Gating

All meeting features require **Pro or higher** tier:
- Calendar polling: `entitlementService.isFeatureAvailable('meetingAssistant')`
- Join and record: `entitlementService.isFeatureAvailable('meetingAssistant')`
- Summarization: `entitlementService.isFeatureAvailable('meetingAssistant')`

## Implementation Checklist

Backend (Complete):
- [x] CalendarPollingService with 30-60 second polling
- [x] PreMeetingNotification handler
- [x] joinAndRecordMeeting() handler
- [x] completeMeetingRecording() handler
- [x] summarizeMeeting() with AI integration stub
- [x] broadcastMeetingSummary() to three surfaces
- [x] IPC handlers for all operations
- [x] Tier gating via entitlementService
- [x] ExecutionRecord generation for work history

Frontend (Needed):
- [ ] Pre-meeting notification modal UI
- [ ] Recording status indicator
- [ ] Meeting summary card in conversation panel
- [ ] Browser tab Meeting Summary section
- [ ] Work history display of recent meetings
- [ ] Email distribution buttons (Send to All / Select Users)
- [ ] Start/stop calendar polling based on tier

## Performance Considerations

- **Calendar Polling**: 45 second interval balances freshness vs API calls
- **Notification Deduplication**: Track notified eventIds for 30 minutes
- **Recording Storage**: Store locally; implement cleanup for old recordings
- **Summary Broadcast**: Sends to all windows simultaneously
- **Work History**: ExecutionRecord automatically indexed for search

## Error Handling

- Invalid meeting links: Rejected with reason
- Calendar access denied: Polling stops gracefully
- Recording failures: Tracked in task logs with error details
- AI summarization failures: Task marked failed with error message
- Window closed during broadcast: Skipped with error logging
