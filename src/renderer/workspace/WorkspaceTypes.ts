import type { ReactNode } from 'react';

/**
 * The Workspace Runtime's extension contract — the mechanism by which a
 * future capability (Floating Code Surface, Browser Preview, Git
 * Timeline, Evidence Viewer, Cinematic Mode) plugs into a predefined
 * visual slot without the shell itself changing. This file must never
 * import anything runtime-specific (no git/browser/build-plugin types) —
 * the Workspace Runtime only ever knows about the generic execution data
 * every runtime already produces (ActionRequest/ActionResult,
 * ConversationTaskRecord).
 */
export type WorkspaceRegionId =
  | 'goal' // current goal + status, always shown when a task is active
  | 'liveExecution' // the live task content — Task Card, embedded as-is
  | 'evidence' // latest verify_rendered_ui result, when present
  | 'floatingSurface' // the currently in-flight action's own path/narration
  | 'browserPreview' // latest real screenshot bytes (dev-browser preview or verify evidence)
  | 'gitTimeline' // RESERVED — future Git Timeline
  // Coding Canvas (Coding Intelligence Runtime Phase 2) — only rendered for
  // a detected coding task (see isCodingTask in WorkspaceRuntime.tsx), never
  // for other runtimes' tasks. Every one of these always renders — an
  // honest placeholder when no real data exists yet, never hidden — same
  // "Not Available Yet" discipline established in the Communication
  // Intelligence Runtime. Go-mode-restricted ones say so explicitly rather
  // than showing an empty section.
  | 'projectUnderstanding'
  | 'todoProgress'
  | 'runningProcesses'
  | 'terminalOutput'
  | 'codeDiff'
  | 'buildStatus'
  | 'testResults'
  | 'browserConsole'
  | 'errorTimeline'
  | 'codingMemory'
  // Infrastructure Canvas (Infrastructure/DevOps/SRE Runtime) — only
  // rendered for a detected infra task (see isInfraTask in
  // WorkspaceRuntime.tsx), same "always renders, honest placeholder when
  // empty" discipline as the Coding Canvas above.
  | 'infrastructureOverview'
  | 'connectedProviders'
  | 'activeDeployments'
  | 'deploymentHistory'
  | 'liveDeploymentStatus'
  | 'ticketInvestigation'
  | 'infrastructureGraph'
  | 'engineeringMemory'
  | 'approvalQueue'
  | 'rollbackHistory'
  // Runtime 9 Phase 3 additions. Infrastructure Explorer/Service Dependency
  // Graph/Production Health/Live Investigation/Incident Timeline/Approval
  // Center/Deployment Timeline from the Phase 3 spec are deliberately NOT
  // new region ids here — they're already served by infrastructureGraph,
  // liveDeploymentStatus, ticketInvestigation, engineeringMemory,
  // approvalQueue, and deploymentHistory respectively (reusing, not
  // duplicating). Only genuinely new surfaces get new ids:
  | 'engineeringReports'
  | 'deploymentComparison'
  // Office Canvas (Office Intelligence Runtime) — only rendered for a
  // detected office task (see isOfficeTask in WorkspaceRuntime.tsx), same
  // "always renders, honest placeholder when empty" discipline as the
  // Coding/Infrastructure Canvases above. Calendar and Shared Files are
  // deliberately NOT included yet — both depend on the OAuth-based
  // provider connectors deferred to OFF-11+ (no real data to back them).
  | 'officeDocuments'
  | 'officeEmail'
  | 'officeTasks'
  | 'officeSearch'
  | 'officeMemory'
  | 'officeTimeline'
  | 'recentOfficeFiles';

/** null render means the region is reserved but not yet populated — no placeholder chrome is shown for it. */
export type WorkspaceRegionSlot = {
  id: WorkspaceRegionId;
  render: (() => ReactNode) | null;
};
