/**
 * How a completed conversation turn's AI Usage is categorized for the Analytics dashboard.
 * Every category is derived from real, already-recorded data — the ActionRequest.type values
 * the Task Card system recorded for that turn (see ConversationTaskAction in ConversationTypes.ts),
 * or the turn's real input source when no action ran. Nothing here is a fabricated usage number;
 * a turn that ran no actions and wasn't spoken is 'chat', full stop.
 */
export type AiUsageCategory =
  | 'chat'
  | 'coding'
  | 'browserAutomation'
  | 'desktopAutomation'
  | 'research'
  | 'meetings'
  | 'voice'
  | 'mobileRuntime'
  | 'companion'
  | 'agentExecution'
  | 'other';

export const AI_USAGE_CATEGORIES: AiUsageCategory[] = [
  'chat',
  'coding',
  'browserAutomation',
  'desktopAutomation',
  'research',
  'meetings',
  'voice',
  'mobileRuntime',
  'companion',
  'agentExecution',
  'other',
];

export const AI_USAGE_CATEGORY_LABELS: Record<AiUsageCategory, string> = {
  chat: 'Chat',
  coding: 'Coding',
  browserAutomation: 'Browser Automation',
  desktopAutomation: 'Desktop Automation',
  research: 'Research',
  meetings: 'Meetings',
  voice: 'Voice',
  mobileRuntime: 'Mobile Runtime',
  companion: 'Companion',
  agentExecution: 'Agent Execution',
  other: 'Other',
};

export const AI_USAGE_CATEGORY_DESCRIPTIONS: Record<AiUsageCategory, string> = {
  chat: 'Direct conversation with Paw — no desktop action was performed.',
  coding: 'Git, builds, installs, running commands, and reading/analyzing your project.',
  browserAutomation: 'Browsing, searching, filling forms, and reading pages on the web.',
  desktopAutomation: 'Files, folders, clipboard, windows, and other local system actions.',
  research: 'Comparisons, workspace investigation, and infrastructure/error lookups.',
  meetings: 'Meeting capture, communication processing, and follow-up drafting.',
  voice: 'Turns you spoke to Paw rather than typed, with no further action taken.',
  mobileRuntime: 'Pairing and managing a paired mobile device.',
  companion: 'Companion goals, routines, and memory.',
  agentExecution: 'Autonomous engineering tasks, deployments, and PR review.',
  other: 'Office documents, image tools, and connector setup.',
};

export const AI_USAGE_CATEGORY_COLORS: Record<AiUsageCategory, string> = {
  chat: '#7c9cff',
  coding: '#4fd1c5',
  browserAutomation: '#f6ad55',
  desktopAutomation: '#a0aec0',
  research: '#b794f4',
  meetings: '#f687b3',
  voice: '#68d391',
  mobileRuntime: '#63b3ed',
  companion: '#fbd38d',
  agentExecution: '#fc8181',
  other: '#718096',
};

/**
 * Real ActionRequest.type -> category assignment, covering every action type in
 * src/shared/actions/ActionTypes.ts as of this writing. Any type not listed here (e.g. a future
 * addition) falls back to 'other' in categorizeActionTypes rather than silently miscategorizing —
 * see that function's fallback.
 */
const CODING_TYPES = new Set([
  'runCommand', 'startProcess', 'stopProcess', 'restartProcess', 'listProcesses', 'getProcessOutput',
  'checkProcessHealth', 'analyzeProject', 'analyzeProjectStructure', 'analyzeFileImpact',
  'listWorkspaces', 'getWorkspace', 'indexWorkspace', 'findFileSemantic', 'getWorkspaceBundle',
  'recordTaskProvenance', 'gitStatus', 'gitDiff', 'gitDiffStat', 'gitLog', 'gitBranch', 'gitShow',
  'gitAdd', 'gitCommit', 'gitCreateBranch', 'gitCheckout', 'installTool', 'detectSoftware',
  'updateSoftware', 'uninstallSoftware', 'repairSoftware', 'verifyToolInstalled', 'setPathEntry',
  'setEnvironmentVariable', 'readEnvVars', 'writeEnvVar', 'buildProject', 'recordErrorFix',
  'findSimilarErrors', 'getCodingMode', 'setCodingMode', 'setTaskChecklist', 'openDevBrowser',
  'refreshDevBrowser', 'devBrowserPreview', 'readBrowserConsole', 'readBrowserNetworkErrors',
  'captureBrowserScreenshot', 'fillDevForm', 'downloadProjectFile', 'uploadProjectFile',
  'extractPageStructure', 'verifyRenderedUi', 'analyzeReferenceImage', 'optimizeImage',
  'generateThumbnail', 'generateResponsiveVariants', 'generateAltText', 'organizeAsset',
]);

const BROWSER_AUTOMATION_TYPES = new Set([
  'browseWeb', 'searchWeb', 'readWebPage', 'extractPageData', 'clickElement', 'scrollBrowserPage',
  'waitForBrowserState', 'fillBrowserForm', 'uploadBrowserFile', 'downloadBrowserFile',
  'listBrowserTabs', 'closeBrowserTab', 'listAvailableBrowsers', 'setPreferredBrowserOrder',
  'getBrowserHistory', 'bookmarkPage', 'listBookmarks', 'getBrowserCookies',
  'reuseExistingBrowserSession', 'printBrowserPageToPdf',
]);

const DESKTOP_AUTOMATION_TYPES = new Set([
  'openUrl', 'openApp', 'openFolder', 'openFile', 'createFolder', 'readClipboard', 'writeFile',
  'copyTextToClipboard', 'readFile', 'listDirectory', 'movePath', 'deletePath', 'searchFiles',
  'copyPath', 'duplicatePath', 'compressPath', 'extractArchive', 'mergeFolders', 'splitFile',
  'restorePath', 'findDuplicateFiles', 'analyzeFolder', 'getSpecialFolders', 'setVolume',
  'arrangeWindows', 'findBluetoothDevices', 'findWifiNetworks',
]);

const RESEARCH_TYPES = new Set([
  'getResearchStatus', 'checkpointResearch', 'recordComparison', 'getComparison',
  'runComparisonWorkflow', 'searchBrowserMemory', 'recordPageSummary', 'discoverInfrastructure',
  'searchInfrastructure', 'getInfrastructureGraphSummary', 'compareDeployments',
  'listEngineeringMemory', 'queryProvenance', 'explainClassification', 'explainRelationship',
]);

const MEETINGS_TYPES = new Set([
  'startMeeting', 'startCommunicationCapture', 'pauseCommunicationCapture',
  'resumeCommunicationCapture', 'stopCommunicationCapture', 'processCommunication',
  'getCommunication', 'getCommunicationTimeline', 'getCompanyWorkspace', 'getContactHistory',
  'searchCommunications', 'addCommunicationNote', 'confirmCommunicationActionItems',
  'resumeInterruptedCommunications', 'draftFollowupEmail', 'listEmailDrafts',
  'openMailComposeWindow', 'confirmEmailSent', 'setEmailDraftPrivate', 'setEmailPreferences',
  'getEmailPreferences', 'confirmGeneralEmailSent',
]);

const MOBILE_RUNTIME_TYPES = new Set(['beginMobilePairing', 'listPairedDevices', 'unpairDevice']);

const COMPANION_TYPES = new Set([
  'recordCompanionGoal', 'listCompanionGoals', 'completeCompanionGoal', 'recordCompanionRoutine',
  'listCompanionRoutines', 'getCompanionMemorySummary', 'resetCompanionMemory',
]);

const AGENT_EXECUTION_TYPES = new Set([
  'deployProject', 'rollbackDeployment', 'promoteDeployment', 'runDeployScript', 'verifyDeployment',
  'getDeploymentStatus', 'getInfraMode', 'setInfraMode', 'listConfiguredInfraConnectors',
  'applyOrganizationCredential', 'getApprovalQueue', 'investigateTicket', 'investigateProductionIssue',
  'startAutonomousEngineeringTask', 'completeAutonomousEngineeringTask', 'endAutonomousEngineeringTask',
  'listPullRequests', 'aiReviewPullRequest',
]);

const OTHER_TYPES = new Set([
  'connectJiraCredential', 'saveGuestConnectorCredential', 'connectivityConnect', 'mergePdfs',
  'createDocx', 'createSpreadsheet', 'analyzeSpreadsheet', 'createPresentation',
  'listRecentOfficeFiles',
]);

function lookupActionCategory(type: string): AiUsageCategory {
  if (CODING_TYPES.has(type)) return 'coding';
  if (BROWSER_AUTOMATION_TYPES.has(type)) return 'browserAutomation';
  if (DESKTOP_AUTOMATION_TYPES.has(type)) return 'desktopAutomation';
  if (RESEARCH_TYPES.has(type)) return 'research';
  if (MEETINGS_TYPES.has(type)) return 'meetings';
  if (MOBILE_RUNTIME_TYPES.has(type)) return 'mobileRuntime';
  if (COMPANION_TYPES.has(type)) return 'companion';
  if (AGENT_EXECUTION_TYPES.has(type)) return 'agentExecution';
  if (OTHER_TYPES.has(type)) return 'other';
  return 'other';
}

/** The most-frequent real category among a turn's executed actions, first-occurrence tie-broken. */
export function categorizeActionTypes(actionTypes: string[]): AiUsageCategory {
  if (actionTypes.length === 0) return 'chat';
  const counts = new Map<AiUsageCategory, number>();
  const firstSeenOrder: AiUsageCategory[] = [];
  for (const type of actionTypes) {
    const category = lookupActionCategory(type);
    if (!counts.has(category)) firstSeenOrder.push(category);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  // firstSeenOrder always has at least one entry here: actionTypes.length > 0 (checked above) means
  // the loop above ran at least once and pushed a category before this line runs.
  let best: AiUsageCategory = firstSeenOrder[0] ?? 'other';
  for (const category of firstSeenOrder) {
    if ((counts.get(category) ?? 0) > (counts.get(best) ?? 0)) best = category;
  }
  return best;
}

/**
 * Categorizes a completed turn. `inputSource` is the turn's real SubmittedInputContext.source —
 * 'typed'/'pasted'/'file'/'image' all mean the user typed or attached something explicitly;
 * undefined means the turn came from the push-to-talk speech pipeline (PawOS's original input
 * mode), which is the one honest signal available for the 'voice' category. Actions taken during
 * a spoken turn still take priority — 'voice' only applies to a turn that was purely conversational.
 */
export function categorizeTurn(actionTypes: string[], inputSource: 'typed' | 'pasted' | 'file' | 'image' | undefined): AiUsageCategory {
  if (actionTypes.length > 0) return categorizeActionTypes(actionTypes);
  return inputSource === undefined ? 'voice' : 'chat';
}
