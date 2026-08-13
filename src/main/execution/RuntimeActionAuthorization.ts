import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import type { RuntimeEntitlementId } from '../../shared/billing/BillingTypes';

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
  }
): ActionResult | null {
  const runtimeId = getRequiredRuntimeForAction(actionType);
  if (!runtimeId) return null;
  if (opts.hasAdvancedRuntimes && opts.isRuntimeEntitled(runtimeId)) return null;

  return {
    ok: false,
    reason: 'entitlement-restricted',
    message: `${runtimeLabel(runtimeId)} is not enabled for this account.`,
    data: { runtimeId, actionType },
  };
}

function runtimeLabel(runtimeId: RuntimeEntitlementId): string {
  switch (runtimeId) {
    case 'coding':
      return 'Coding Runtime';
    case 'office':
      return 'Office Runtime';
    case 'browser':
      return 'Browser Runtime';
    case 'communication':
      return 'Communication Runtime';
    case 'infrastructure':
      return 'Infrastructure Runtime';
    default:
      return 'This runtime';
  }
}
