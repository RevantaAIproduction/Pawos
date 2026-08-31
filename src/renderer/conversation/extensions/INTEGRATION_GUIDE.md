# Message Extension System — Integration Guide

## Overview

The Message Extension System provides **inline, live-updating cards** embedded directly in chat messages. Extensions display compact previews and can expand to the internal right-side tool area (Terminal, WorkTree, Browser).

## Architecture

```
ConversationMessage
  ├── content (text)
  ├── task (TaskRecord, optional)
  └── extensions (MessageExtension[], new)
       ├── PermissionExtension
       ├── TaskProgressExtension
       ├── FileChangeExtension
       ├── MarkdownPreviewExtension
       ├── BrowserPreviewExtension
       ├── DownloadProgressExtension
       ├── AgentStatusExtension
       └── LiveStatusExtension
```

## Extension Types

### 1. Permission Extension
Shows permission requests inline. Actionable pending → approved/denied → executing → completed.

```typescript
import { createPermissionExtension } from './extensions/ExtensionHelpers';

const permExt = createPermissionExtension({
  title: 'Install Python 3.13',
  description: 'Required by the project environment.',
  requiredScopes: ['executeShell', 'modifyFiles'],
  allowedActions: ['allow-once', 'allow-always', 'deny'],
  taskId: 'task-123',
  actionId: 'action-456',
});
```

**States:** pending → approved/denied → executing → completed/failed

### 2. Task Progress Extension
Real-time task execution progress with action timeline.

```typescript
import { createTaskProgressExtension } from './extensions/ExtensionHelpers';

const taskExt = createTaskProgressExtension({
  taskId: 'task-123',
  goal: 'Install Python',
  state: 'running',
  progress: 45,
  currentAction: 'Downloading Python 3.13...',
  actions: [
    {
      id: 'a1',
      type: 'download',
      inProgressText: 'Downloading Python',
      status: 'completed',
    },
    {
      id: 'a2',
      type: 'install',
      inProgressText: 'Installing dependencies',
      status: 'running',
    },
  ],
  expandTarget: 'terminal', // Opens Terminal card on expand
});
```

**States:** queued → running → progress → waiting-permission → completed/failed/stopped

### 3. File Change Extension
Shows edited files with color-coded status (green=added, red=removed, yellow=modifying).

```typescript
import { createFileChangeExtension } from './extensions/ExtensionHelpers';

const filesExt = createFileChangeExtension({
  files: [
    { path: 'src/main.ts', status: 'modified', additions: 10, deletions: 5 },
    { path: 'src/utils.ts', status: 'added', additions: 45, deletions: 0 },
    { path: 'src/old.ts', status: 'deleted', additions: 0, deletions: 30 },
  ],
  state: 'detected',
  summary: '3 files changed in this session',
});
```

**Opens in:** WorkTree with full diff view

### 4. Markdown Preview Extension
Shows structured content inline with optional truncation.

```typescript
import { createMarkdownPreviewExtension } from './extensions/ExtensionHelpers';

const mdExt = createMarkdownPreviewExtension({
  title: 'Project Summary',
  content: '# Summary\n\nProject generated successfully...',
  truncated: true,
  maxHeight: 150,
});
```

### 5. Browser Preview Extension
Shows downloads, web pages, live previews.

```typescript
import { createBrowserPreviewExtension } from './extensions/ExtensionHelpers';

const browserExt = createBrowserPreviewExtension({
  title: 'Downloading Python Installer',
  url: 'https://python.org/downloads/python-3.13.0.exe',
  state: 'downloading',
  downloadProgress: {
    current: 156 * 1024 * 1024, // bytes
    total: 350 * 1024 * 1024,
    speed: '5.2 MB/s',
    eta: 39, // seconds
  },
});
```

### 6. Download Progress Extension
Progress indicator for builds, deployments, file transfers.

```typescript
import { createDownloadProgressExtension } from './extensions/ExtensionHelpers';

const dlExt = createDownloadProgressExtension({
  name: 'Building project...',
  state: 'downloading',
  progress: 72,
  speed: '3.4 MB/s',
  eta: 28,
  downloaded: '72 MB',
  totalSize: '100 MB',
});
```

### 7. Agent Status Extension
Shows agent execution with step-by-step progress.

```typescript
import { createAgentStatusExtension } from './extensions/ExtensionHelpers';

const agentExt = createAgentStatusExtension({
  agentId: 'agent-123',
  agentName: 'Code Review Agent',
  state: 'running',
  currentStep: 'Analyzing files...',
  totalSteps: 5,
  steps: [
    { id: 's1', name: 'Parse files', status: 'completed' },
    { id: 's2', name: 'Analyze patterns', status: 'running', progress: 60 },
    { id: 's3', name: 'Generate report', status: 'pending' },
  ],
});
```

## Integration with ConversationRuntime

### Adding Extensions to Messages

When creating a message in ConversationRuntime, attach extensions:

```typescript
// In ConversationRuntime.ts or message handlers

const message = {
  id: 'msg-123',
  role: 'assistant' as const,
  content: 'Installing Python and dependencies...',
  createdAt: Date.now(),
  status: 'final' as const,
  extensions: [permissionExt, taskProgressExt], // ← Add extensions here
};
```

### Updating Extensions in Real-Time

As tasks progress, update the extension state:

```typescript
import { updateExtension, transitionExtensionState } from './extensions/ExtensionHelpers';

// Update progress
taskExt = updateExtension(taskExt, {
  progress: 50,
  currentAction: 'Installing packages...',
});

// Transition state
taskExt = transitionExtensionState(taskExt, 'progress', {
  progress: 75,
});

// Replace extension in message
message.extensions = message.extensions.map((ext) =>
  ext.id === taskExt.id ? taskExt : ext
);

// Notify listeners (ConversationPanel will re-render)
notifyMessageUpdated(message);
```

### State Transitions

#### Permission Extension
```
pending
  ├→ approved → executing → completed
  ├→ approved → executing → failed
  └→ denied
```

#### Task Progress Extension
```
queued
  → running
  → progress (with % updates)
  → waiting-permission (if blocked)
  → completed
  → failed
  → stopped (if interrupted)
```

#### File Change Extension
```
detecting → detected → staged → committed
          └→ conflict
```

## Extension Expand Behavior

When user clicks the expand arrow (↗) on an extension:

1. **ExtensionRenderer** fires `onExpand` callback
2. **ConversationPanel** calls `handleExtensionExpand(request)`
3. **CompanionExperience** opens the appropriate card:
   - `target: 'terminal'` → opens Terminal card
   - `target: 'worktree'` → opens WorkTree card
   - `target: 'browser'` → opens Browser card
   - `target: 'agents'` → opens Agents card
   - `target: 'tasks'` → opens Tasks card

The content remains **synchronized** between inline preview and expanded view.

## Permission Extension Flow

### User Experience
```
[Chat shows permission request inline]
User clicks "Allow Once" or "Always Allow"
→ Extension transitions to "approved" state
→ Extension updates inline to show "Permission approved. Executing..."
→ Task begins executing
→ Task Progress extension shows real-time progress
→ On completion, shows completion state
```

### Implementation
```typescript
// In ConversationPanel.handleExtensionAction()
if (action === 'allow-once' || action === 'allow-always') {
  // 1. Transition permission extension
  permExt = transitionExtensionState(permExt, 'approved');
  
  // 2. Update message
  updateMessage(message, { extensions: [...] });
  
  // 3. Call conversation controller to execute
  // conversation.approvePermissionAction(taskId, actionId, action);
  
  // 4. Replace with task progress extension if task continues
  // Later, as task progresses, TaskProgressExtension updates inline
}
```

## Real-Time Synchronization

Extensions update in real-time when:
- Task state changes (via ConversationRuntime)
- Agent progress updates (via AgentRuntime)
- File changes are detected (via FileWatcher)
- Download progress updates (via BrowserRuntime)
- Permission decisions are made (via PermissionHandler)

**Mechanism:**
1. Event fires (task updated, progress changed, etc.)
2. Extension state is updated in the message
3. Message is broadcast to listeners
4. ConversationPanel re-renders with updated extension
5. Inline card updates, expanded view (if open) also updates

## Extension Styling

All extensions use native PawOS styling:
- Dark theme (rgba colors)
- Compact inline cards (height ≤ 100px collapsed)
- Subtle borders and backgrounds
- Progress bars with gradient
- Status icons with color coding
- Responsive, mobile-friendly

See `extensions.module.css` for complete styling.

## Adding New Extension Types

### 1. Create type in `ExtensionTypes.ts`
```typescript
export interface MyExtension {
  type: 'my-type';
  id: string;
  state: 'pending' | 'done';
  // ... other fields
  timestamp: number;
}

export type MessageExtension = ... | MyExtension;
```

### 2. Create helper in `ExtensionHelpers.ts`
```typescript
export function createMyExtension(options: {...}): MyExtension {
  return {
    type: 'my-type',
    id: options.id || `my-${Date.now()}`,
    state: 'pending',
    // ...
    timestamp: Date.now(),
  };
}
```

### 3. Create component in `components/MyExtensionCard.tsx`
```typescript
export function MyExtensionCard({ extension, onExpand, onAction }) {
  return (
    <div className={styles.extensionCard}>
      {/* Render extension */}
    </div>
  );
}
```

### 4. Register in `ExtensionRenderer.tsx`
```typescript
case 'my-type':
  return <MyExtensionCard extension={extension} onExpand={onExpand} onAction={onAction} />;
```

## Testing

### Manual Testing
1. Run `npm run dev` to start the app
2. Send a message that triggers a permission: "Install Python"
3. Permission extension appears inline
4. Click "Allow Once" → extension transitions to "approved"
5. Task progresses → Task Progress extension shows percentage
6. Click expand arrow → Browser/Terminal card opens on right
7. Close card → returns to full-width conversation

### Automated Testing (TODO)
Create `extensions.test.ts` with tests for:
- Extension creation helpers
- State transitions
- Real-time updates
- Expand/collapse behavior
- Permission flow

## Best Practices

1. **One extension per concern** — Don't combine permission + progress into one
2. **Update frequently** — Extensions should feel real-time (update every 500ms)
3. **Compact inline** — Keep inline view under 100px height, use expand for details
4. **State transitions** — Always transition through expected states (don't jump)
5. **Accessible expand** — Always provide expand button when there's a full view
6. **Graceful degradation** — Extensions should work even if expand target isn't available

## Future Enhancements

- [ ] Notification badges when extension updates
- [ ] Sound alerts for failures/completions
- [ ] Extension history sidebar
- [ ] Extension filtering/search
- [ ] Custom extension types via plugins
- [ ] Drag-and-drop extension reordering
- [ ] Extension persistence (save/restore state)
