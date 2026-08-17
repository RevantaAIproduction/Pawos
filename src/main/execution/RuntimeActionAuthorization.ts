import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import type { RuntimeEntitlementId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

const OFFICE_ACTION_TYPES: ActionRequest['type'][] = [
  'mergePdfs',
  'createDocx',
  'createSpreadsheet',
  'analyzeSpreadsheet',
  'createPresentation',
  'listRecentOfficeFiles',
  'confirmGeneralEmailSent',
];

const BROWSER_ACTION_TYPES: ActionRequest['type'][] = [
  'openDevBrowser',
  'refreshDevBrowser',
  'readBrowserConsole',
  'readBrowserNetworkErrors',
  'captureBrowserScreenshot',
  'fillDevForm',
  'downloadProjectFile',
  'uploadProjectFile',
  'browseWeb',
  'searchWeb',
  'readWebPage',
  'extractPageData',
  'clickElement',
  'scrollBrowserPage',
  'waitForBrowserState',
  'fillBrowserForm',
  'uploadBrowserFile',
  'downloadBrowserFile',
  'listBrowserTabs',
  'closeBrowserTab',
  'listAvailableBrowsers',
  'getBrowserHistory',
  'bookmarkPage',
  'listBookmarks',
  'recordPageSummary',
  'searchBrowserMemory',
  'recordComparison',
  'getComparison',
  'runComparisonWorkflow',
  'checkpointResearch',
  'getResearchStatus',
  'getBrowserCookies',
  'reuseExistingBrowserSession',
  'setPreferredBrowserOrder',
  'printBrowserPageToPdf',
];

const COMMUNICATION_ACTION_TYPES: ActionRequest['type'][] = [
  'startCommunicationCapture',
  'pauseCommunicationCapture',
  'resumeCommunicationCapture',
  'stopCommunicationCapture',
  'processCommunication',
  'getCommunication',
  'getCommunicationTimeline',
  'getCompanyWorkspace',
  'getContactHistory',
  'searchCommunications',
  'addCommunicationNote',
  'confirmCommunicationActionItems',
  'resumeInterruptedCommunications',
  'draftFollowupEmail',
  'listEmailDrafts',
  'openMailComposeWindow',
  'confirmEmailSent',
  'setEmailDraftPrivate',
  'copyTextToClipboard',
  'setEmailPreferences',
  'getEmailPreferences',
];

const RUNTIME_ACTION_TYPES: Partial<Record<RuntimeEntitlementId, ActionRequest['type'][]>> = {
  coding: CODING_EXECUTION_ACTION_TYPES,
  office: OFFICE_ACTION_TYPES,
  browser: BROWSER_ACTION_TYPES,
  communication: COMMUNICATION_ACTION_TYPES,
  infrastructure: INFRA_EXECUTION_ACTION_TYPES,
};

const RUNTIME_ACTION_ENTRIES = Object.entries(RUNTIME_ACTION_TYPES) as [RuntimeEntitlementId, ActionRequest['type'][]][];

export function getRequiredRuntimeForAction(actionType: ActionRequest['type']): RuntimeEntitlementId | null {
  return RUNTIME_ACTION_ENTRIES.find(([, actionTypes]) => actionTypes.includes(actionType))?.[0] ?? null;
}

export function authorizeRuntimeAction(
  actionType: ActionRequest['type'],
  opts: {
    hasAdvancedRuntimes: boolean;
    isRuntimeEntitled: (runtimeId: RuntimeEntitlementId) => boolean;
    /** The real tier that unlocks this action, resolved by the caller via
     *  entitlementService.findMinimumTierForFeature('advancedRuntimes') — never guessed here. */
    requiredTier?: SubscriptionTierId | null;
  }
): ActionResult | null {
  const runtimeId = getRequiredRuntimeForAction(actionType);
  if (!runtimeId) return null;
  if (opts.hasAdvancedRuntimes && opts.isRuntimeEntitled(runtimeId)) return null;

  return {
    ok: false,
    reason: 'entitlement-restricted',
    // Plain-English capability description — never an internal runtime name (e.g. "Coding
    // Runtime"), so a customer never sees PawOS's own internal architecture in a block message.
    message: `${capabilityLabel(runtimeId)} requires a plan that supports it.`,
    data: { requiredFeature: 'advancedRuntimes', requiredTier: opts.requiredTier ?? null, runtimeId, actionType },
  };
}

function capabilityLabel(runtimeId: RuntimeEntitlementId): string {
  switch (runtimeId) {
    case 'coding':
      return 'Running and editing code';
    case 'office':
      return 'Creating and editing documents, spreadsheets, and presentations';
    case 'browser':
      return 'Browser automation and web research';
    case 'communication':
      return 'Meeting and call recording';
    case 'infrastructure':
      return 'Infrastructure and deployment actions';
    default:
      return 'This action';
  }
}
