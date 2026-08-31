import { useMemo } from 'react';
import { getIpcBridge } from './ipcBridge';
import type { SettingsState } from './ipcTypes';
import type { CompanionCommand } from '../../../shared/companion/CompanionCommand';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ForegroundWindowInfo } from '../../../shared/system/ForegroundWindowInfo';
import type {
  ConversationSession,
  ConversationSessionSummary,
  ConversationSessionTurn,
  SessionContinuationHint,
} from '../../../shared/conversation/ConversationSessionTypes';
import type { ProcessOutputEvent, ProcessExitEvent } from '../../../shared/actions/ProcessTypes';
import type { WorkspaceFileChangeEvent } from '../../../shared/actions/WorkspaceFileChangeTypes';
import type { WorkspaceObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import type { ExecutionRecord } from '../../../shared/actions/ExecutionRecordTypes';
import type { BrowserCapabilityReport } from '../../../shared/actions/BrowserCapabilityTypes';
import type { CommunicationRuntimeEvent } from '../../../shared/communication/CommunicationTypes';
import type { CreditBalance, EntitlementSnapshot, FeatureId, SubscriptionState, SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import type { PawModelId } from '../../../shared/ai/PawModelTypes';
import type { AiUsageCategory } from '../../../shared/billing/AiUsageCategories';
import type {
  TurnUsageSubmission,
  AggregatedTurnUsage,
  NormalizedUsageRecord,
  ProviderUsageMetadata,
  UsageRequestType,
} from '../../../shared/billing/UsageMeteringTypes';

export function useIpcBridge() {
  const ipc = useMemo(() => getIpcBridge(), []);

  return useMemo(
    () => ({
      executeAction: async (request: ActionRequest): Promise<ActionResult> => ipc.actionExecute(request),
      checkActionRequirements: async (request: ActionRequest): Promise<ActionRequirement[]> =>
        ipc.actionCheckRequirements(request),
      describeAction: async (request: ActionRequest): Promise<string> => ipc.actionDescribe(request),
      reportActionResult: async (request: ActionRequest, result: ActionResult): Promise<string> =>
        ipc.actionReportResult(request, result),
      getAnimationsBaseUrl: async (): Promise<string> => ipc.assetsGetAnimationsBaseUrl(),
      getCharactersBaseUrl: async (): Promise<string> => ipc.assetsGetCharactersBaseUrl(),

      enableCompanion: async (): Promise<boolean> => ipc.companionEnable(),
      disableCompanion: async (): Promise<boolean> => ipc.companionDisable(),
      isCompanionEnabled: async (): Promise<boolean> => ipc.companionIsEnabled(),
      sendCompanionCommand: async (command: CompanionCommand): Promise<boolean> => ipc.companionSendCommand(command),
      onCompanionCommand: (cb: (command: CompanionCommand) => void) => ipc.onCompanionCommand(cb),
      notifyCompanionReady: (): void => ipc.companionNotifyReady(),
      onCompanionReady: (cb: () => void) => ipc.onCompanionReady(cb),
      showCompanionNotification: async (title: string, body: string): Promise<boolean> =>
        ipc.companionShowNotification(title, body),

      getSettings: async (): Promise<SettingsState> => ipc.settingsGet(),
      petsList: async () => ipc.petsList(),

      loadPet: async (petId: string) => ipc.petsLoad(petId),

      setSettings: async (partial: Partial<SettingsState>) => ipc.settingsSet(partial),

      onSettingsUpdated: (cb: (s: SettingsState) => void) => ipc.onSettingsUpdated(cb),
      onUiOpenSettings: (cb: () => void) => ipc.onUiOpenSettings(cb),
      openUpgradeInDashboard: () => ipc.openUpgradeInDashboard(),
      onUiNavigateUpgrade: (cb: () => void) => ipc.onUiNavigateUpgrade(cb),
      onTaskCreditsPurchased: (cb: (payload: { amountUsd?: number; organizationId?: string }) => void) =>
        ipc.onTaskCreditsPurchased(cb),

      moveOverlayWindow: async (x: number, y: number): Promise<boolean> => ipc.overlayMoveWindow(x, y),
      getOverlayWindowBounds: async (): Promise<{ x: number; y: number; width: number; height: number } | null> =>
        ipc.overlayGetWindowBounds(),
      getScreenWorkArea: async (): Promise<{ width: number; height: number }> => ipc.overlayGetScreenWorkArea(),
      setOverlayInteractive: async (active: boolean): Promise<boolean> => ipc.overlaySetInteractive(active),

      getEnvApiKeys: async (): Promise<{ gemini?: string }> => ipc.envGetApiKeys(),

      getForegroundWindowInfo: async (): Promise<ForegroundWindowInfo> => ipc.systemGetForegroundWindowInfo(),
      getAppVersion: async (): Promise<string> => ipc.systemGetAppVersion(),

      sendMail: async (method: string, to: string, params: unknown): Promise<boolean> => ipc.mailSend(method, to, params),
      listMailTemplates: async (): Promise<{ key: string; label: string }[]> => ipc.mailListTemplates(),
      renderMailPreview: async (key: string): Promise<string> => ipc.mailRenderPreview(key),

      listSessions: async (): Promise<ConversationSessionSummary[]> => ipc.sessionsList(),
      getSession: async (id: string): Promise<ConversationSession | undefined> => ipc.sessionsGet(id),
      searchSessions: async (query: string): Promise<ConversationSessionSummary[]> => ipc.sessionsSearch(query),
      appendSessionTurn: async (turn: ConversationSessionTurn, hint?: SessionContinuationHint): Promise<ConversationSession> =>
        ipc.sessionsAppendTurn(turn, hint),
      renameSession: async (id: string, title: string): Promise<ConversationSession | undefined> =>
        ipc.sessionsRename(id, title),
      setSessionPinned: async (id: string, pinned: boolean): Promise<ConversationSession | undefined> =>
        ipc.sessionsSetPinned(id, pinned),
      setSessionArchived: async (id: string, archived: boolean): Promise<ConversationSession | undefined> =>
        ipc.sessionsSetArchived(id, archived),
      deleteSession: async (id: string): Promise<boolean> => ipc.sessionsDelete(id),
      exportSession: async (id: string): Promise<string | undefined> => ipc.sessionsExport(id),
      onSessionsUpdated: (cb: () => void) => ipc.onSessionsUpdated(cb),

      recordExecution: async (record: ExecutionRecord): Promise<void> => ipc.executionRecord(record),
      listExecutions: async (): Promise<ExecutionRecord[]> => ipc.executionList(),
      executionSetSelected: async (executionId: string | null): Promise<{ ok: boolean }> => ipc.executionSetSelected(executionId),
      executionGetSelected: async (): Promise<string | null> => ipc.executionGetSelected(),
      onExecutionUpdated: (cb: () => void) => ipc.onExecutionUpdated(cb),
      getBrowserCapabilities: async (): Promise<BrowserCapabilityReport[]> => ipc.browserGetCapabilities(),

      onProcessOutput: (cb: (event: ProcessOutputEvent) => void) => ipc.onProcessOutput(cb),
      onProcessExit: (cb: (event: ProcessExitEvent) => void) => ipc.onProcessExit(cb),
      onWorkspaceFileChanged: (cb: (event: WorkspaceFileChangeEvent) => void) => ipc.onWorkspaceFileChanged(cb),
      onWorkspaceObservation: (cb: (event: WorkspaceObservationEvent) => void) => ipc.onWorkspaceObservation(cb),
      onCommunicationEvent: (cb: (event: CommunicationRuntimeEvent) => void) => ipc.onCommunicationEvent(cb),

      entitlementGetSnapshot: async (): Promise<EntitlementSnapshot> => ipc.entitlementGetSnapshot(),
      entitlementGetModelTierRequirements: async (): Promise<Partial<Record<PawModelId, SubscriptionTierId>>> =>
        ipc.entitlementGetModelTierRequirements(),
      entitlementGetFeatureTierRequirements: async (): Promise<Partial<Record<FeatureId, SubscriptionTierId>>> =>
        ipc.entitlementGetFeatureTierRequirements(),
      billingGetSubscription: async (): Promise<SubscriptionState> => ipc.billingGetSubscription(),
      billingGetGooglePlacesApiKey: async (): Promise<string> => ipc.billingGetGooglePlacesApiKey(),
      billingCanStartGeneration: async (pawModelId?: PawModelId): Promise<{ allowed: boolean; reason?: string; pooled?: boolean }> =>
        ipc.billingCanStartGeneration(pawModelId),
      billingConsumeCredit: async (amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId): Promise<CreditBalance> =>
        ipc.billingConsumeCredit(amount, reason, category, pawModelId),
      billingRecordTurnUsage: async (
        submission: TurnUsageSubmission,
        reason: string,
        category?: AiUsageCategory,
        pawModelId?: PawModelId
      ): Promise<{ aggregated: AggregatedTurnUsage; balance: CreditBalance }> =>
        ipc.billingRecordTurnUsage(submission, reason, category, pawModelId),
      billingReportUsageEvent: async (
        usage: ProviderUsageMetadata,
        requestType: UsageRequestType,
        context: { sessionId: string | null; runId: string | null }
      ): Promise<NormalizedUsageRecord> => ipc.billingReportUsageEvent(usage, requestType, context),
      billingGetUsageEvents: async (limit?: number): Promise<NormalizedUsageRecord[]> => ipc.billingGetUsageEvents(limit),
      billingGrantComputeBonus: async (units: number): Promise<EntitlementSnapshot> => ipc.billingGrantComputeBonus(units),

      governanceApprove: async (approvalId: string): Promise<{ ok: boolean; error?: string }> =>
        ipc.governanceApprove(approvalId),
      governanceDeny: async (approvalId: string): Promise<{ ok: boolean; error?: string }> =>
        ipc.governanceDeny(approvalId),
      governanceGetPending: async (): Promise<Array<{ approvalId: string; actionType: string; requestedAt: number }>> =>
        ipc.governanceGetPending(),
      onGovernanceApproved: (cb: (payload: { approvalId: string }) => void) =>
        ipc.onGovernanceApproved(cb),
      onGovernanceDenied: (cb: (payload: { approvalId: string }) => void) =>
        ipc.onGovernanceDenied(cb),
    }),
    [ipc]
  );
}

