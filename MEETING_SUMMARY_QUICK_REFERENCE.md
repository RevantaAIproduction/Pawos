# Meeting Summary System - Quick Reference Guide

## Component Usage

### Using MeetingSummaryCard
```typescript
import { MeetingSummaryCard } from './RightSidebar/MeetingSummaryCard';
import type { Meeting } from '../../../shared/workspace/MeetingTypes';

export function MyComponent() {
  const meeting: Meeting = {
    id: 'meeting-123',
    title: 'Q4 Planning',
    // ... other meeting properties
    summary: { /* meeting summary */ },
    recording: { /* recording details */ }
  };

  return (
    <MeetingSummaryCard
      meeting={meeting}
      onDistributeClick={(summary) => {
        // Handle distribution click - open modal
        console.log('Distribute:', summary);
      }}
    />
  );
}
```

### Using MeetingDistributionModal
```typescript
import { MeetingDistributionModal } from './RightSidebar/MeetingDistributionModal';
import type { Meeting, StructuredSummary } from '../../../shared/workspace/MeetingTypes';

export function MyComponent() {
  const [showModal, setShowModal] = useState(false);
  const meeting = /* ... */;
  const summary: StructuredSummary = /* ... */;

  return (
    <>
      <button onClick={() => setShowModal(true)}>Send Summary</button>
      
      {showModal && (
        <MeetingDistributionModal
          meeting={meeting}
          summary={summary}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            console.log('Distribution completed');
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}
```

## IPC Handler Usage

### Generate Structured Summary
```typescript
const ipc = useIpcBridge();

const result = await ipc.invoke(
  'meeting:generateStructuredSummary',
  'meeting-123'
);

if (result.ok) {
  const structured = result.structured;
  console.log(structured.purpose);
  console.log(structured.keyTakeaways);
  console.log(structured.topics);
  console.log(structured.actionItems);
}
```

### Crop Summary
```typescript
const result = await ipc.invoke('meeting:cropSummary', {
  meetingId: 'meeting-123',
  selectedTopics: ['Topic 1', 'Topic 2'],
  selectedActionItems: ['action-1', 'action-3']
});

if (result.ok) {
  const cropped = result.cropped;
  // cropped.topics filtered to selected
  // cropped.actionItems filtered to selected
}
```

### Save Draft
```typescript
const result = await ipc.invoke('meeting:saveDraft', {
  meetingId: 'meeting-123',
  recipients: ['john@company.com', 'jane@company.com'],
  contentType: 'cropped',
  selectedContent: {
    topics: ['Topic 1'],
    actionItems: ['action-1']
  },
  emailDraft: {
    subject: 'Meeting Summary - Q4 Planning',
    body: 'Here is the summary...'
  }
});

if (result.ok) {
  console.log('Draft saved:', result.draft.id);
}
```

### Schedule Send
```typescript
const result = await ipc.invoke('meeting:scheduleSend', {
  meetingId: 'meeting-123',
  recipients: ['john@company.com'],
  contentType: 'entire',
  emailContent: {
    subject: 'Meeting Summary',
    body: 'Here is the summary...'
  },
  scheduledTime: Date.parse('2024-09-05T10:00:00')
});

if (result.ok) {
  console.log('Scheduled for:', new Date(result.scheduledSend.scheduledTime));
}
```

### Get Scheduled Sends
```typescript
const result = await ipc.invoke('meeting:getScheduledSends', 'meeting-123');

if (result.ok) {
  result.scheduled.forEach(send => {
    console.log(`${send.recipients.length} recipients at ${new Date(send.scheduledTime)}`);
    console.log(`Status: ${send.status}`);
  });
}
```

### Get Drafts
```typescript
const result = await ipc.invoke('meeting:getDrafts', 'meeting-123');

if (result.ok) {
  result.drafts.forEach(draft => {
    console.log(`Draft ${draft.id}: ${draft.recipients.length} recipients`);
  });
}
```

## Type Definitions

### StructuredSummary
```typescript
interface StructuredSummary {
  purpose: string;                    // Meeting purpose
  keyTakeaways: string[];            // Key points discussed
  topics: TopicSegment[];            // Topics with timestamps
  actionItems: ActionItem[];         // Action items with owners
}
```

### TopicSegment
```typescript
interface TopicSegment {
  name: string;                      // Topic name
  timestamp: number;                 // Time in seconds from start
  content: string;                   // Topic description
  duration?: number;                 // Duration in seconds
}
```

### ActionItem
```typescript
interface ActionItem {
  id: string;                        // Unique ID
  task: string;                      // Task description
  owner: string;                     // Owner name
  ownerEmail?: string;              // Owner email
  dueDate?: string;                 // YYYY-MM-DD format
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: number;                // Time in recording (seconds)
}
```

### DistributionRequest
```typescript
interface DistributionRequest {
  meetingId: string;
  recipients: string[];              // Email addresses
  contentType: 'entire' | 'cropped';
  selectedTopics?: string[];         // Topic names if cropped
  selectedActionItems?: string[];    // Action item IDs if cropped
  sendMethod: 'now' | 'scheduled' | 'draft';
  scheduledTime?: number;           // Timestamp if scheduled
  includeRecording?: boolean;
  includeTimestamps?: boolean;
}
```

### MeetingDraft
```typescript
interface MeetingDraft {
  id: string;                        // Draft ID
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
```

### ScheduledSend
```typescript
interface ScheduledSend {
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
```

## Common Patterns

### Full Distribution Workflow
```typescript
const ipc = useIpcBridge();
const [meeting, setMeeting] = useState<Meeting | null>(null);
const [summary, setSummary] = useState<StructuredSummary | null>(null);
const [showModal, setShowModal] = useState(false);

// 1. Load meeting and generate summary
useEffect(() => {
  loadMeetingAndSummary();
}, []);

const loadMeetingAndSummary = async () => {
  const meeting = await ipc.invoke('meeting:get', meetingId);
  setMeeting(meeting.meeting);
  
  const summaryResult = await ipc.invoke(
    'meeting:generateStructuredSummary',
    meetingId
  );
  setSummary(summaryResult.structured);
};

// 2. Handle distribution
const handleDistribute = (structured: StructuredSummary) => {
  setSummary(structured);
  setShowModal(true);
};

// 3. On success from modal
const handleDistributionSuccess = () => {
  setShowModal(false);
  // Refresh or show confirmation
};

return (
  <>
    {meeting && (
      <MeetingSummaryCard
        meeting={meeting}
        onDistributeClick={handleDistribute}
      />
    )}
    {summary && showModal && (
      <MeetingDistributionModal
        meeting={meeting!}
        summary={summary}
        onClose={() => setShowModal(false)}
        onSuccess={handleDistributionSuccess}
      />
    )}
  </>
);
```

### Email Preview Generation
```typescript
function generateEmailBody(
  summary: StructuredSummary,
  contentType: 'entire' | 'cropped',
  selectedTopics?: Set<string>,
  selectedActionItems?: Set<string>
): string {
  let body = `Hi team,\n\nHere's the summary:\n\n`;
  
  body += `Purpose:\n${summary.purpose}\n\n`;
  
  if (contentType === 'entire') {
    // Include all topics and action items
    body += 'Topics:\n';
    summary.topics.forEach(t => {
      body += `• ${t.name} (${formatTime(t.timestamp)})\n`;
    });
    
    body += '\nAction Items:\n';
    summary.actionItems.forEach(a => {
      body += `• ${a.task} - ${a.owner} (Due: ${a.dueDate})\n`;
    });
  } else {
    // Include only selected items
    const topics = summary.topics.filter(t => selectedTopics?.has(t.name));
    const items = summary.actionItems.filter(a => selectedActionItems?.has(a.id));
    
    // Same as above but filtered
  }
  
  body += '\nBest regards,\nPawOS';
  return body;
}
```

## Error Handling

```typescript
try {
  const result = await ipc.invoke('meeting:generateStructuredSummary', meetingId);
  
  if (!result.ok) {
    console.error('Failed to generate summary:', result.reason);
    showError(result.reason);
  } else {
    // Use result.structured
  }
} catch (error) {
  console.error('IPC error:', error);
  showError('An unexpected error occurred');
}
```

## Tier Checking

Before calling any meeting handlers, verify tier:
```typescript
const result = await ipc.invoke('meeting:generateStructuredSummary', meetingId);

if (result.reason?.includes('requires Pro')) {
  // Show tier upgrade prompt
  showUpgradeDialog();
} else if (!result.ok) {
  showError(result.reason);
}
```

## CSS Customization

### MeetingSummaryCard Theme
```css
.card {
  --color-surface: #0a0e27;          /* Card background */
  --color-text-primary: rgba(255, 255, 255, 0.9);
  --color-text-secondary: rgba(255, 255, 255, 0.6);
  --color-border: rgba(255, 255, 255, 0.08);
  --color-accent: rgba(100, 150, 255, 0.8);
  --color-success: rgba(100, 200, 100, 0.9);
  --color-warning: rgba(255, 200, 0, 0.9);
  --color-error: rgba(255, 100, 100, 0.9);
}
```

### Modal Sizing
```typescript
// In modal CSS, adjust max-width as needed
.modal {
  width: 90%;
  max-width: 600px;      // Change this for wider/narrower
  max-height: 90vh;      // Adjust for different screen heights
}
```

## Performance Tips

1. **Memoize components** when meeting data doesn't change frequently
2. **Use useCallback** for distribution handlers to avoid recreations
3. **Lazy load** structured summary only when needed
4. **Debounce** email body updates if doing complex generation
5. **Paginate** recipient lists if > 100 attendees

## Troubleshooting

### Summary not loading?
- Check browser console for IPC errors
- Verify meeting ID is correct
- Ensure meeting has a summary (check meeting.summary exists)

### Modal not appearing?
- Check state management for showModal flag
- Verify meeting and summary are not null
- Check CSS z-index conflicts

### Email preview not updating?
- Ensure contentType state updates trigger re-render
- Check selected topics/items state updates
- Verify generateEmailBody function is called

### Recipients not selectable?
- Check recipientMode state is 'selected'
- Verify attendees array is populated
- Check input field is not hidden by CSS

## Future Enhancements

1. **Recording playback** with timeline scrubbing
2. **AI action item assignment** based on context
3. **Distribution templates** for common recipients
4. **Email template system** instead of plain text
5. **Attachment support** for documents mentioned
6. **Calendar integration** to auto-add due dates
7. **Slack/Teams distribution** in addition to email
8. **Recording summaries** for different audiences
