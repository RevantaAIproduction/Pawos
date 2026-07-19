import { EventEmitter } from 'events';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../shared/actions/ActionTypes';
import { DESTRUCTIVE_ACTION_TYPES, CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import { codingModeStore } from './CodingModeStore';
import { infraModeStore } from '../infrastructure/InfraModeStore';
import { pendingApprovalStore, deriveApprovalKey } from '../infrastructure/PendingApprovalStore';
import type { ExecutionTrail, ObservationEvent } from '../../shared/actions/ExecutionLifecycle';
import type { DesktopPlugin } from './DesktopPlugin';
import { openAppPlugin } from './plugins/OpenAppPlugin';
import { openUrlPlugin } from './plugins/OpenUrlPlugin';
import { openFolderPlugin } from './plugins/OpenFolderPlugin';
import { openFilePlugin } from './plugins/OpenFilePlugin';
import { createFolderPlugin } from './plugins/CreateFolderPlugin';
import { searchFilesPlugin } from './plugins/SearchFilesPlugin';
import { readClipboardPlugin } from './plugins/ReadClipboardPlugin';
import { writeFilePlugin } from './plugins/WriteFilePlugin';
import { runCommandPlugin } from './plugins/RunCommandPlugin';
import { startProcessPlugin } from './plugins/StartProcessPlugin';
import { stopProcessPlugin } from './plugins/StopProcessPlugin';
import { restartProcessPlugin } from './plugins/RestartProcessPlugin';
import { listProcessesPlugin } from './plugins/ListProcessesPlugin';
import { getProcessOutputPlugin } from './plugins/GetProcessOutputPlugin';
import { analyzeProjectPlugin } from './plugins/AnalyzeProjectPlugin';
import { analyzeProjectStructurePlugin } from './plugins/AnalyzeProjectStructurePlugin';
import { analyzeFileImpactPlugin } from './plugins/AnalyzeFileImpactPlugin';
import { listWorkspacesPlugin } from './plugins/ListWorkspacesPlugin';
import { getWorkspacePlugin } from './plugins/GetWorkspacePlugin';
import { checkProcessHealthPlugin } from './plugins/CheckProcessHealthPlugin';
import { readFilePlugin } from './plugins/ReadFilePlugin';
import { listDirectoryPlugin } from './plugins/ListDirectoryPlugin';
import { movePathPlugin } from './plugins/MovePathPlugin';
import { deletePathPlugin } from './plugins/DeletePathPlugin';
import { copyPathPlugin } from './plugins/CopyPathPlugin';
import { duplicatePathPlugin } from './plugins/DuplicatePathPlugin';
import { compressPathPlugin } from './plugins/CompressPathPlugin';
import { extractArchivePlugin } from './plugins/ExtractArchivePlugin';
import { mergeFoldersPlugin } from './plugins/MergeFoldersPlugin';
import { splitFilePlugin } from './plugins/SplitFilePlugin';
import { restorePathPlugin } from './plugins/RestorePathPlugin';
import { indexWorkspacePlugin } from './plugins/IndexWorkspacePlugin';
import { recordTaskProvenancePlugin } from './plugins/RecordTaskProvenancePlugin';
import { findFileSemanticPlugin } from './plugins/FindFileSemanticPlugin';
import { getWorkspaceBundlePlugin } from './plugins/GetWorkspaceBundlePlugin';
import { queryProvenancePlugin } from './plugins/QueryProvenancePlugin';
import { explainClassificationPlugin } from './plugins/ExplainClassificationPlugin';
import { explainRelationshipPlugin } from './plugins/ExplainRelationshipPlugin';
import { findDuplicateFilesPlugin } from './plugins/FindDuplicateFilesPlugin';
import { analyzeFolderPlugin } from './plugins/AnalyzeFolderPlugin';
import { getSpecialFoldersPlugin } from './plugins/GetSpecialFoldersPlugin';
import { gitStatusPlugin } from './plugins/GitStatusPlugin';
import { gitDiffPlugin } from './plugins/GitDiffPlugin';
import { gitLogPlugin } from './plugins/GitLogPlugin';
import { gitBranchPlugin } from './plugins/GitBranchPlugin';
import { gitShowPlugin } from './plugins/GitShowPlugin';
import { gitAddPlugin } from './plugins/GitAddPlugin';
import { gitCommitPlugin } from './plugins/GitCommitPlugin';
import { gitCreateBranchPlugin } from './plugins/GitCreateBranchPlugin';
import { gitCheckoutPlugin } from './plugins/GitCheckoutPlugin';
import { installToolPlugin } from './plugins/InstallToolPlugin';
import { detectSoftwarePlugin } from './plugins/DetectSoftwarePlugin';
import { updateSoftwarePlugin } from './plugins/UpdateSoftwarePlugin';
import { uninstallSoftwarePlugin } from './plugins/UninstallSoftwarePlugin';
import { repairSoftwarePlugin } from './plugins/RepairSoftwarePlugin';
import { verifyToolInstalledPlugin } from './plugins/VerifyToolInstalledPlugin';
import { setPathEntryPlugin } from './plugins/SetPathEntryPlugin';
import { setEnvironmentVariablePlugin } from './plugins/SetEnvironmentVariablePlugin';
import { openDevBrowserPlugin } from './plugins/OpenDevBrowserPlugin';
import { refreshDevBrowserPlugin } from './plugins/RefreshDevBrowserPlugin';
import { readBrowserConsolePlugin } from './plugins/ReadBrowserConsolePlugin';
import { readBrowserNetworkPlugin } from './plugins/ReadBrowserNetworkPlugin';
import { captureBrowserScreenshotPlugin } from './plugins/CaptureBrowserScreenshotPlugin';
import { fillDevFormPlugin } from './plugins/FillDevFormPlugin';
import { downloadProjectFilePlugin } from './plugins/DownloadProjectFilePlugin';
import { uploadProjectFilePlugin } from './plugins/UploadProjectFilePlugin';
import { browseWebPlugin } from './plugins/BrowseWebPlugin';
import { searchWebPlugin } from './plugins/SearchWebPlugin';
import { readWebPagePlugin } from './plugins/ReadWebPagePlugin';
import { extractPageDataPlugin } from './plugins/ExtractPageDataPlugin';
import { clickElementPlugin } from './plugins/ClickElementPlugin';
import { scrollBrowserPagePlugin } from './plugins/ScrollBrowserPagePlugin';
import { waitForBrowserStatePlugin } from './plugins/WaitForBrowserStatePlugin';
import { fillBrowserFormPlugin } from './plugins/FillBrowserFormPlugin';
import { uploadBrowserFilePlugin } from './plugins/UploadBrowserFilePlugin';
import { downloadBrowserFilePlugin } from './plugins/DownloadBrowserFilePlugin';
import { listBrowserTabsPlugin } from './plugins/ListBrowserTabsPlugin';
import { closeBrowserTabPlugin } from './plugins/CloseBrowserTabPlugin';
import { listAvailableBrowsersPlugin } from './plugins/ListAvailableBrowsersPlugin';
import { getBrowserHistoryPlugin } from './plugins/GetBrowserHistoryPlugin';
import { bookmarkPagePlugin } from './plugins/BookmarkPagePlugin';
import { listBookmarksPlugin } from './plugins/ListBookmarksPlugin';
import { recordPageSummaryPlugin } from './plugins/RecordPageSummaryPlugin';
import { searchBrowserMemoryPlugin } from './plugins/SearchBrowserMemoryPlugin';
import { recordComparisonPlugin } from './plugins/RecordComparisonPlugin';
import { getComparisonPlugin } from './plugins/GetComparisonPlugin';
import { comparisonWorkflowPlugin } from './plugins/ComparisonWorkflowPlugin';
import { checkpointResearchPlugin } from './plugins/CheckpointResearchPlugin';
import { getResearchStatusPlugin } from './plugins/GetResearchStatusPlugin';
import { getBrowserCookiesPlugin } from './plugins/GetBrowserCookiesPlugin';
import { reuseExistingBrowserSessionPlugin } from './plugins/ReuseExistingBrowserSessionPlugin';
import { printBrowserPageToPdfPlugin } from './plugins/PrintBrowserPageToPdfPlugin';
import { setPreferredBrowserOrderPlugin } from './plugins/SetPreferredBrowserOrderPlugin';
import { buildProjectPlugin } from './plugins/BuildProjectPlugin';
import { readEnvVarsPlugin } from './plugins/ReadEnvVarsPlugin';
import { writeEnvVarPlugin } from './plugins/WriteEnvVarPlugin';
import { runDeployScriptPlugin } from './plugins/RunDeployScriptPlugin';
import { verifyDeploymentPlugin } from './plugins/VerifyDeploymentPlugin';
import { recordErrorFixPlugin } from './plugins/RecordErrorFixPlugin';
import { findSimilarErrorsPlugin } from './plugins/FindSimilarErrorsPlugin';
import { notImplementedPlugin } from './plugins/NotImplementedPlugin';
import { analyzeReferenceImagePlugin } from './plugins/AnalyzeReferenceImagePlugin';
import { extractPageStructurePlugin } from './plugins/ExtractPageStructurePlugin';
import { optimizeImagePlugin } from './plugins/OptimizeImagePlugin';
import { generateThumbnailPlugin } from './plugins/GenerateThumbnailPlugin';
import { generateResponsiveVariantsPlugin } from './plugins/GenerateResponsiveVariantsPlugin';
import { generateAltTextPlugin } from './plugins/GenerateAltTextPlugin';
import { organizeAssetPlugin } from './plugins/OrganizeAssetPlugin';
import { visualVerificationPlugin } from './plugins/VisualVerificationPlugin';
import { startCommunicationCapturePlugin } from './plugins/StartCommunicationCapturePlugin';
import { pauseCommunicationCapturePlugin } from './plugins/PauseCommunicationCapturePlugin';
import { resumeCommunicationCapturePlugin } from './plugins/ResumeCommunicationCapturePlugin';
import { stopCommunicationCapturePlugin } from './plugins/StopCommunicationCapturePlugin';
import { processCommunicationPlugin } from './plugins/ProcessCommunicationPlugin';
import { getCommunicationPlugin } from './plugins/GetCommunicationPlugin';
import { getCommunicationTimelinePlugin } from './plugins/GetCommunicationTimelinePlugin';
import { getCompanyWorkspacePlugin } from './plugins/GetCompanyWorkspacePlugin';
import { searchCommunicationsPlugin } from './plugins/SearchCommunicationsPlugin';
import { addCommunicationNotePlugin } from './plugins/AddCommunicationNotePlugin';
import { confirmCommunicationActionItemsPlugin } from './plugins/ConfirmCommunicationActionItemsPlugin';
import { resumeInterruptedCommunicationsPlugin } from './plugins/ResumeInterruptedCommunicationsPlugin';
import { beginMobilePairingPlugin } from './plugins/BeginMobilePairingPlugin';
import { listPairedDevicesPlugin } from './plugins/ListPairedDevicesPlugin';
import { unpairDevicePlugin } from './plugins/UnpairDevicePlugin';
import { getContactHistoryPlugin } from './plugins/GetContactHistoryPlugin';
import { draftFollowupEmailPlugin } from './plugins/DraftFollowupEmailPlugin';
import { listEmailDraftsPlugin } from './plugins/ListEmailDraftsPlugin';
import { openMailComposeWindowPlugin } from './plugins/OpenMailComposeWindowPlugin';
import { confirmEmailSentPlugin } from './plugins/ConfirmEmailSentPlugin';
import { setEmailDraftPrivatePlugin } from './plugins/SetEmailDraftPrivatePlugin';
import { copyTextToClipboardPlugin } from './plugins/CopyTextToClipboardPlugin';
import { setEmailPreferencesPlugin } from './plugins/SetEmailPreferencesPlugin';
import { getEmailPreferencesPlugin } from './plugins/GetEmailPreferencesPlugin';
import { getCodingModePlugin } from './plugins/GetCodingModePlugin';
import { setCodingModePlugin } from './plugins/SetCodingModePlugin';
import { setTaskChecklistPlugin } from './plugins/SetTaskChecklistPlugin';
import { gitDiffStatPlugin } from './plugins/GitDiffStatPlugin';
import { devBrowserPreviewPlugin } from './plugins/DevBrowserPreviewPlugin';
import { deployProjectPlugin } from './plugins/infrastructure/DeployProjectPlugin';
import { rollbackDeploymentPlugin } from './plugins/infrastructure/RollbackDeploymentPlugin';
import { promoteDeploymentPlugin } from './plugins/infrastructure/PromoteDeploymentPlugin';
import { getApprovalQueuePlugin } from './plugins/infrastructure/GetApprovalQueuePlugin';
import { listEngineeringMemoryPlugin } from './plugins/infrastructure/ListEngineeringMemoryPlugin';
import { getInfrastructureGraphSummaryPlugin } from './plugins/infrastructure/GetInfrastructureGraphSummaryPlugin';
import { getDeploymentStatusPlugin } from './plugins/infrastructure/GetDeploymentStatusPlugin';
import { listConfiguredInfraConnectorsPlugin } from './plugins/infrastructure/ListConfiguredInfraConnectorsPlugin';
import { investigateTicketPlugin } from './plugins/infrastructure/InvestigateTicketPlugin';
import { investigateProductionIssuePlugin } from './plugins/infrastructure/InvestigateProductionIssuePlugin';
import { compareDeploymentsPlugin } from './plugins/infrastructure/CompareDeploymentsPlugin';
import { discoverInfrastructurePlugin } from './plugins/infrastructure/DiscoverInfrastructurePlugin';
import { searchInfrastructurePlugin } from './plugins/infrastructure/SearchInfrastructurePlugin';
import { mergePdfsPlugin } from './plugins/office/MergePdfsPlugin';
import { createDocxPlugin } from './plugins/office/CreateDocxPlugin';
import { createSpreadsheetPlugin } from './plugins/office/CreateSpreadsheetPlugin';
import { analyzeSpreadsheetPlugin } from './plugins/office/AnalyzeSpreadsheetPlugin';
import { createPresentationPlugin } from './plugins/office/CreatePresentationPlugin';
import { listRecentOfficeFilesPlugin } from './plugins/office/ListRecentOfficeFilesPlugin';
import { confirmGeneralEmailSentPlugin } from './plugins/office/ConfirmGeneralEmailSentPlugin';
import { recordCompanionGoalPlugin } from './plugins/companion/RecordCompanionGoalPlugin';
import { listCompanionGoalsPlugin } from './plugins/companion/ListCompanionGoalsPlugin';
import { completeCompanionGoalPlugin } from './plugins/companion/CompleteCompanionGoalPlugin';
import { recordCompanionRoutinePlugin } from './plugins/companion/RecordCompanionRoutinePlugin';
import { listCompanionRoutinesPlugin } from './plugins/companion/ListCompanionRoutinesPlugin';
import { getCompanionMemorySummaryPlugin } from './plugins/companion/GetCompanionMemorySummaryPlugin';
import { resetCompanionMemoryPlugin } from './plugins/companion/ResetCompanionMemoryPlugin';
import { getInfraModePlugin } from './plugins/infrastructure/GetInfraModePlugin';
import { setInfraModePlugin } from './plugins/infrastructure/SetInfraModePlugin';

/** Observe → Diagnose → Repair → Retry → Verify — max 3 automatic attempts, then honestly report failure rather than looping or silently giving up. */
const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Paw's one path from "do this on the desktop" to a real OS effect. Paw
 * only ever decides WHICH plugin handles a request (findPlugin) — every
 * later step in the pipeline (missing-info check, execute, verify, natural
 * report) is delegated to that plugin, so adding a new desktop skill later
 * (Excel, Power BI, VS Code, Blender, ...) means writing one new plugin and
 * registering it below, never touching this class or the conversation layer.
 */
export class DesktopExecutionEngine extends EventEmitter {
  private plugins: DesktopPlugin[] = [
    openAppPlugin,
    openUrlPlugin,
    openFolderPlugin,
    openFilePlugin,
    createFolderPlugin,
    searchFilesPlugin,
    readClipboardPlugin,
    writeFilePlugin,
    runCommandPlugin,
    startProcessPlugin,
    stopProcessPlugin,
    restartProcessPlugin,
    listProcessesPlugin,
    getProcessOutputPlugin,
    analyzeProjectPlugin,
    listWorkspacesPlugin,
    getWorkspacePlugin,
    checkProcessHealthPlugin,
    readFilePlugin,
    listDirectoryPlugin,
    movePathPlugin,
    deletePathPlugin,
    copyPathPlugin,
    duplicatePathPlugin,
    compressPathPlugin,
    extractArchivePlugin,
    mergeFoldersPlugin,
    splitFilePlugin,
    restorePathPlugin,
    indexWorkspacePlugin,
    recordTaskProvenancePlugin,
    findFileSemanticPlugin,
    getWorkspaceBundlePlugin,
    queryProvenancePlugin,
    explainClassificationPlugin,
    explainRelationshipPlugin,
    findDuplicateFilesPlugin,
    analyzeFolderPlugin,
    getSpecialFoldersPlugin,
    gitStatusPlugin,
    gitDiffPlugin,
    gitLogPlugin,
    gitBranchPlugin,
    gitShowPlugin,
    gitAddPlugin,
    gitCommitPlugin,
    gitCreateBranchPlugin,
    gitCheckoutPlugin,
    installToolPlugin,
    detectSoftwarePlugin,
    updateSoftwarePlugin,
    uninstallSoftwarePlugin,
    repairSoftwarePlugin,
    verifyToolInstalledPlugin,
    setPathEntryPlugin,
    setEnvironmentVariablePlugin,
    openDevBrowserPlugin,
    refreshDevBrowserPlugin,
    readBrowserConsolePlugin,
    readBrowserNetworkPlugin,
    captureBrowserScreenshotPlugin,
    fillDevFormPlugin,
    downloadProjectFilePlugin,
    uploadProjectFilePlugin,
    browseWebPlugin,
    searchWebPlugin,
    readWebPagePlugin,
    extractPageDataPlugin,
    clickElementPlugin,
    scrollBrowserPagePlugin,
    waitForBrowserStatePlugin,
    fillBrowserFormPlugin,
    uploadBrowserFilePlugin,
    downloadBrowserFilePlugin,
    listBrowserTabsPlugin,
    closeBrowserTabPlugin,
    listAvailableBrowsersPlugin,
    getBrowserHistoryPlugin,
    bookmarkPagePlugin,
    listBookmarksPlugin,
    recordPageSummaryPlugin,
    searchBrowserMemoryPlugin,
    recordComparisonPlugin,
    getComparisonPlugin,
    comparisonWorkflowPlugin,
    checkpointResearchPlugin,
    getResearchStatusPlugin,
    getBrowserCookiesPlugin,
    reuseExistingBrowserSessionPlugin,
    setPreferredBrowserOrderPlugin,
    printBrowserPageToPdfPlugin,
    buildProjectPlugin,
    readEnvVarsPlugin,
    writeEnvVarPlugin,
    runDeployScriptPlugin,
    verifyDeploymentPlugin,
    recordErrorFixPlugin,
    findSimilarErrorsPlugin,
    analyzeReferenceImagePlugin,
    extractPageStructurePlugin,
    optimizeImagePlugin,
    generateThumbnailPlugin,
    generateResponsiveVariantsPlugin,
    generateAltTextPlugin,
    organizeAssetPlugin,
    visualVerificationPlugin,
    startCommunicationCapturePlugin,
    pauseCommunicationCapturePlugin,
    resumeCommunicationCapturePlugin,
    stopCommunicationCapturePlugin,
    processCommunicationPlugin,
    getCommunicationPlugin,
    getCommunicationTimelinePlugin,
    getCompanyWorkspacePlugin,
    searchCommunicationsPlugin,
    addCommunicationNotePlugin,
    confirmCommunicationActionItemsPlugin,
    resumeInterruptedCommunicationsPlugin,
    beginMobilePairingPlugin,
    listPairedDevicesPlugin,
    unpairDevicePlugin,
    getContactHistoryPlugin,
    draftFollowupEmailPlugin,
    listEmailDraftsPlugin,
    openMailComposeWindowPlugin,
    confirmEmailSentPlugin,
    setEmailDraftPrivatePlugin,
    copyTextToClipboardPlugin,
    setEmailPreferencesPlugin,
    getEmailPreferencesPlugin,
    getCodingModePlugin,
    setCodingModePlugin,
    analyzeProjectStructurePlugin,
    analyzeFileImpactPlugin,
    setTaskChecklistPlugin,
    gitDiffStatPlugin,
    devBrowserPreviewPlugin,
    deployProjectPlugin,
    rollbackDeploymentPlugin,
    promoteDeploymentPlugin,
    getDeploymentStatusPlugin,
    listConfiguredInfraConnectorsPlugin,
    getApprovalQueuePlugin,
    listEngineeringMemoryPlugin,
    getInfrastructureGraphSummaryPlugin,
    investigateTicketPlugin,
    investigateProductionIssuePlugin,
    compareDeploymentsPlugin,
    discoverInfrastructurePlugin,
    searchInfrastructurePlugin,
    mergePdfsPlugin,
    createDocxPlugin,
    createSpreadsheetPlugin,
    analyzeSpreadsheetPlugin,
    createPresentationPlugin,
    listRecentOfficeFilesPlugin,
    confirmGeneralEmailSentPlugin,
    recordCompanionGoalPlugin,
    listCompanionGoalsPlugin,
    completeCompanionGoalPlugin,
    recordCompanionRoutinePlugin,
    listCompanionRoutinesPlugin,
    getCompanionMemorySummaryPlugin,
    resetCompanionMemoryPlugin,
    getInfraModePlugin,
    setInfraModePlugin,
    notImplementedPlugin, // must stay last — catches everything still unbuilt
  ];

  private findPlugin(request: ActionRequest): DesktopPlugin | undefined {
    return this.plugins.find((p) => p.canHandle(request));
  }

  /** "Collect Missing Information" — what the user needs to be asked before this can run, if anything. */
  requirements(request: ActionRequest): ActionRequirement[] {
    return this.findPlugin(request)?.requirements(request) ?? [];
  }

  describeInProgress(request: ActionRequest): string {
    return this.findPlugin(request)?.describeInProgress(request) ?? 'Working on that…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    return this.findPlugin(request)?.describeDone(request, result) ?? (result.ok ? 'Done.' : "I couldn't finish that.");
  }

  /**
   * Runs the full action lifecycle — prepare → execute → observe → verify →
   * (bounded) recover → re-verify — and enforces the destructive-action
   * confirmation gate globally so no individual plugin has to remember to.
   * A failed verify() gets up to MAX_RECOVERY_ATTEMPTS real repair passes
   * (Observe → Diagnose → Repair → Retry → Verify) before honestly reporting
   * failure — never a silent stop, never an unbounded loop.
   */
  async execute(request: ActionRequest): Promise<ActionResult> {
    if (CODING_EXECUTION_ACTION_TYPES.includes(request.type) && codingModeStore.getMode() === 'go') {
      return {
        ok: false,
        reason: 'coding-mode-restricted',
        message:
          'Paw Go is designed for planning and analysis. Upgrade to Paw Pro to generate, modify, build, test, debug, and continuously improve your project using the full Coding Intelligence Runtime.',
      };
    }

    if (INFRA_EXECUTION_ACTION_TYPES.includes(request.type) && infraModeStore.getMode() === 'investigate') {
      return {
        ok: false,
        reason: 'infra-mode-restricted',
        message:
          'Infrastructure investigation mode is read-only — I can read tickets, check status, and check health, but deploying or rolling back needs Full mode enabled in Settings.',
      };
    }

    if (DESTRUCTIVE_ACTION_TYPES.includes(request.type) && !('confirmed' in request && request.confirmed)) {
      const approval = deriveApprovalKey(request);
      if (approval) pendingApprovalStore.record({ ...approval, requestedAt: Date.now() });
      return { ok: false, reason: 'requires-confirmation' };
    }

    const infraApproval = deriveApprovalKey(request);
    if (infraApproval) pendingApprovalStore.resolve(infraApproval.id);

    const plugin = this.findPlugin(request);
    if (!plugin) return { ok: false, reason: 'not-implemented' };

    const prepared = await plugin.prepare(request);
    const [firstMissing] = prepared.requirements;
    if (firstMissing) {
      return { ok: false, reason: 'failed', message: firstMissing.message };
    }

    const observations: ObservationEvent[] = [];
    let result: ActionResult = prepared.reuse ?? (await plugin.execute(request));
    for await (const event of plugin.observe(request, result)) {
      observations.push(event);
      this.emit('observation', { actionType: request.type, event });
    }
    result = await plugin.verify(request, result);

    let attempts = 0;
    let recovered = false;
    // A pending confirmation isn't a failure to repair — some plugins are
    // conditionally destructive (writeFile/browseWeb) and signal this
    // themselves rather than through the global DESTRUCTIVE_ACTION_TYPES
    // gate above; retrying would risk silently bypassing that gate.
    while (!result.ok && result.reason !== 'requires-confirmation' && attempts < MAX_RECOVERY_ATTEMPTS) {
      attempts += 1;
      const recoveredResult = await plugin.recover(request, result);
      result = await plugin.verify(request, recoveredResult);
      if (result.ok) recovered = true;
    }

    const trail: ExecutionTrail = { attempts, recovered, observations };
    return { ...result, trail };
  }
}

export const desktopExecutionEngine = new DesktopExecutionEngine();
