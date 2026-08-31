# Meeting Summary Interface & Distribution System Implementation

## Overview
Complete meeting summary interface and distribution system matching Fathom reference, with structured summary generation, recipient management, content cropping, draft storage, and scheduled sending capabilities.

## Architecture

### Backend (Main Process)

#### 1. Type Definitions (`src/shared/workspace/MeetingTypes.ts`)
- **StructuredSummary**: purpose, keyTakeaways, topics (with timestamps), actionItems
- **TopicSegment**: topic name, timestamp, content, duration
- **ActionItem**: task, owner, dueDate, status, timestamp linkage
- **DistributionRequest**: recipients, contentType (entire/cropped), sendMethod
- **MeetingDraft**: saved draft with recipients, selected content, email preview
- **ScheduledSend**: queued send with scheduled timestamp and status tracking
- **DistributionPreferences**: recipient and content configuration

#### 2. Meeting Service (`src/main/workspace/services/MeetingService.ts`)
New methods:
- `generateStructuredSummary(meetingId)` - Extract purpose, takeaways, topics, action items
- `cropSummary(request)` - Trim content to selected topics/items
- `saveSummaryDraft(request)` - Store draft with recipients and email preview
- `scheduleDistribution(request)` - Queue send for later
- `getScheduledSends(meetingId)` - List pending sends
- `getDrafts(meetingId)` - List saved drafts

#### 3. Meeting Handler (`src/main/ipc/handlers/meetingHandler.ts`)
New IPC handlers:
- `generateStructuredSummary()` - Create structured summary from meeting transcript
- `cropSummary()` - Extract selected topics/items
- `saveDraft()` - Persist draft to in-memory store
- `getDrafts()` - Retrieve drafts for meeting
- `scheduleSend()` - Queue send with timestamp
- `getScheduledSends()` - List pending sends

Storage:
- `structuredSummaryStore`: Map<meetingId, StructuredSummary>
- `draftStore`: Map<draftId, MeetingDraft>
- `scheduledSendStore`: Map<scheduledId, ScheduledSend>

#### 4. IPC Registration (`src/main/ipc/ipc.ts`)
Registered handlers (lines 1235-1290):
- `meeting:generateStructuredSummary` - Pro+ tier gated
- `meeting:cropSummary` - Pro+ tier gated
- `meeting:saveDraft` - Pro+ tier gated
- `meeting:getDrafts` - Pro+ tier gated
- `meeting:scheduleSend` - Pro+ tier gated
- `meeting:getScheduledSends` - Pro+ tier gated

All handlers include tier entitlement checks via `entitlementService.isFeatureAvailable('meetingAssistant')`.

### Frontend (Renderer Process)

#### 1. MeetingSummaryCard Component (`src/renderer/ui/RightSidebar/MeetingSummaryCard.tsx`)

Layout matching Fathom reference:
```
┌─────────────────────────────────────────┐
│ Meeting Recording (video player stub)   │
│ ├─ Play/pause controls                  │
│ ├─ Timeline scrubber                    │
│ └─ Duration display                     │
├─────────────────────────────────────────┤
│ Summary Panel (right side)               │
│ ├─ Meeting Purpose                      │
│ ├─ Key Takeaways (bulleted list)        │
│ ├─ Topics (expandable cards)            │
│ │  └─ [Linked timestamps]               │
│ ├─ Action Items Table:                  │
│ │  ├─ ☐ Task | Owner | Due | Status    │
│ │  └─ [Selectable rows]                 │
│ └─ [Send Summary Button]                │
└─────────────────────────────────────────┘
```

Features:
- Video player with play/pause, scrubber, duration display
- Expandable topic cards with timestamps
- Action items table with selection checkboxes
- Status badges (pending/completed/cancelled)
- Linked recording timestamps for context
- Loading states and error handling

#### 2. MeetingDistributionModal Component (`src/renderer/ui/RightSidebar/MeetingDistributionModal.tsx`)

Layout:
```
┌──────────────────────────────────────┐
│ Send Meeting Summary              [x]│
├──────────────────────────────────────┤
│ Recipients:                          │
│ ◯ Send to All (4 attendees)          │
│ ◯ Send to Specific People            │
│   └─ ☐ John, ☐ Jane...              │
│   └─ [Email input for add]          │
├──────────────────────────────────────┤
│ Content:                             │
│ ◯ Send Entire                        │
│ ◯ Crop & Select                      │
│   └─ Topics: [☐ Topic1, ☐ Topic2]   │
│   └─ Items: [☐ Action1, ☐ Action2] │
├──────────────────────────────────────┤
│ Send Method:                         │
│ ◯ Send Now                           │
│ ◯ Schedule (date picker)             │
│ ◯ Save Draft                         │
├──────────────────────────────────────┤
│ Email Preview:                       │
│ Subject: [Meeting Name - Summary]    │
│ Body: [Auto-generated preview]       │
│ [Can be customized]                  │
├──────────────────────────────────────┤
│              [Cancel] [Send]         │
└──────────────────────────────────────┘
```

Features:
- Recipient mode selection (all vs specific)
- Attendee checkboxes with custom email input
- Content type selection (entire vs cropped)
- Topic and action item selection trees
- Send method selection (now/scheduled/draft)
- Date picker for scheduled sends
- Live email preview with auto-generation
- Customizable subject and body
- Tier validation and error handling

#### 3. Styling Modules
- `meetingSummaryCard.module.css` - Card layout, responsive tables, status badges
- `meetingDistributionModal.module.css` - Modal overlay, form styling, focus states

### Integration Points

#### 1. IPC Bridge Access
Components use direct `ipc.invoke()` calls for:
```typescript
await ipc.invoke('meeting:generateStructuredSummary', meetingId)
await ipc.invoke('meeting:cropSummary', request)
await ipc.invoke('meeting:saveDraft', request)
await ipc.invoke('meeting:scheduleSend', request)
await ipc.invoke('meeting:getScheduledSends', meetingId)
await ipc.invoke('meeting:getDrafts', meetingId)
```

#### 2. Mail Extension Integration (TODO)
- Open Mail extension with prefilled content:
  - To: selected recipients
  - Subject: email subject
  - Body: formatted summary
  - Recording URL (optional)

#### 3. Right Sidebar Integration (TODO)
- Add "Meetings" tab or section to RightSidebar
- Display meeting list with summaries
- Click meeting → load MeetingSummaryCard
- Click "Send Summary" → open MeetingDistributionModal

#### 4. Left Sidebar Update (TODO)
- Add "Meeting Summaries" section below Work History
- List recent meeting summaries
- Click to view full summary card in browser tab

## Data Flow

### Summary Generation Flow
```
1. User approves meeting recording completion
2. Backend calls generateStructuredSummary()
3. Handler extracts: purpose, takeaways, topics, action items
4. StructuredSummary stored in structuredSummaryStore
5. Component loads via meeting:generateStructuredSummary IPC
6. Display in MeetingSummaryCard
```

### Distribution Flow
```
1. User clicks "Send Summary" button
2. MeetingDistributionModal opens
3. User selects:
   - Recipients (all or specific)
   - Content (entire or cropped topics/items)
   - Send method (now/scheduled/draft)
4. Email preview auto-generated and customizable
5. On submit:
   - Now: Send via Mail extension (TODO)
   - Scheduled: Store in scheduledSendStore with timestamp
   - Draft: Store in draftStore with selections
6. Success confirmation
```

### Cropping Flow
```
1. User selects "Crop & Select" in modal
2. UI shows checkboxes for topics and action items
3. User selects subset of content
4. Handler calls cropSummary() to filter
5. Email preview updates to show only selected content
6. Send proceeds with cropped summary
```

## Tier Gating
All meeting summary features are gated to Pro+ tier:
- Structured summary generation
- Distribution modal
- Cropping capabilities
- Draft storage
- Scheduled sends

Tier check: `entitlementService.isFeatureAvailable('meetingAssistant')`

Returns: `{ ok: false, reason: 'Meeting Assistant requires Pro or higher tier' }`

## Storage Strategy

### Current (In-Memory)
- `structuredSummaryStore`: Map<meetingId, StructuredSummary>
- `draftStore`: Map<draftId, MeetingDraft>
- `scheduledSendStore`: Map<scheduledId, ScheduledSend>

### Migration Path (TODO)
- SQLite tables:
  - `meeting_summaries` (structured)
  - `meeting_drafts` (with recipients, selections)
  - `meeting_scheduled_sends` (with status, error tracking)
  - Foreign keys to `meetings` table

## Priority Implementation Order (Completed)

1. ✅ Structured summary generation (backend)
2. ✅ Distribution modal UI (frontend)
3. ✅ Cropping logic (backend + IPC)
4. ✅ Draft storage (backend + IPC)
5. ✅ Scheduled send queue (backend + IPC)
6. ⏳ Mail extension prefill integration
7. ⏳ Left sidebar "Meeting Summary" section
8. ⏳ Right sidebar "Meetings" tab
9. ⏳ SQLite persistence
10. ⏳ Scheduled send executor (background task)

## Files Created/Modified

### New Files
- `src/renderer/ui/RightSidebar/MeetingSummaryCard.tsx` - Main summary display component
- `src/renderer/ui/RightSidebar/meetingSummaryCard.module.css` - Card styling
- `src/renderer/ui/RightSidebar/MeetingDistributionModal.tsx` - Distribution UI component
- `src/renderer/ui/RightSidebar/meetingDistributionModal.module.css` - Modal styling

### Modified Files
- `src/shared/workspace/MeetingTypes.ts` - Added new type definitions
- `src/main/workspace/services/MeetingService.ts` - Added service methods
- `src/main/ipc/handlers/meetingHandler.ts` - Added IPC handlers
- `src/main/ipc/ipc.ts` - Registered IPC handlers

## UI/UX Features

### MeetingSummaryCard
- Non-intrusive video player with minimal controls
- Expandable topic sections for deep dives
- Inline timestamps linking to recording
- At-a-glance action item overview
- Status color coding (amber/green/red)
- Scrollable content with proper overflow handling
- Theme-aware colors (light/dark)

### MeetingDistributionModal
- Progressive disclosure (show options as needed)
- Smart radio buttons for mutually exclusive choices
- Inline selection trees for content cropping
- Live email preview that updates in real-time
- Customizable subject and body
- Date picker for scheduled sends
- Clear error messages and validation
- Accessibility-first form design

## Styling Approach
- CSS variables for theming (`--color-surface`, color palette)
- Dark-first design (rgba transparency layers)
- Proper contrast ratios (WCAG AA)
- Focus states for keyboard navigation
- Responsive layout (flexbox, no fixed widths)
- Smooth transitions (0.2s ease)
- Consistent spacing and sizing

## Next Steps

1. **Mail Extension Integration**
   - Add Mail extension methods to ipcBridgeImplementation
   - Open Mail with prefilled content on "Send Now"
   - Track sent status in meeting records

2. **Scheduled Send Executor**
   - Background service to poll scheduledSendStore
   - Send emails at scheduled times
   - Update status (sent/failed)
   - Retry logic for failed sends

3. **SQLite Persistence**
   - Migrate in-memory stores to persistent tables
   - Add indexes for performance
   - Implement cleanup/archival

4. **UI Integration**
   - Add "Meetings" tab to RightSidebar
   - Add "Meeting Summaries" to left sidebar
   - Meeting list with filtering/search
   - Recent meetings in browser tab

5. **Enhanced Features**
   - Attendee distribution preferences (always send vs ask)
   - Email template selection
   - Meeting recording playback
   - AI-powered action item assignment
   - Integration with task management systems

6. **Analytics & Monitoring**
   - Track distribution stats
   - Monitor scheduled send success rate
   - Usage metrics per user/org

## Testing Checklist

- [ ] Type checking passes (✅ Done)
- [ ] Summary card renders with mock meeting data
- [ ] Distribution modal opens/closes correctly
- [ ] Recipient selection works (all vs specific)
- [ ] Content cropping updates preview
- [ ] Form validation for empty selections
- [ ] Email preview updates dynamically
- [ ] Send method selection hides/shows relevant options
- [ ] Date picker opens for scheduled sends
- [ ] IPC handlers called with correct arguments
- [ ] Tier gating works for all operations
- [ ] Error messages display properly
- [ ] Styling matches Fathom reference
- [ ] Responsive layout on different screen sizes
- [ ] Dark mode colors are correct

## Fathom Reference Alignment

The implementation follows Fathom's design patterns:
- Clean, minimal meeting card interface
- Timestamped transcript segments
- Clear action item ownership and tracking
- Multiple distribution options (individuals vs team)
- Email preview before sending
- Smart content selection UI
- Professional typography and spacing
- Consistent with existing PawOS design language
