import type {
  SettingsState,
  FeedbackSubmission,
  HelpActivityState,
  SupportConversation,
  SupportConversationTurn,
  SupportConversationStatus,
} from './ipcTypes';
import type { CompanionCommand } from '../../../shared/companion/CompanionCommand';
import type { CompanionPackageInput, ImportedCompanionPackage } from '../../../shared/companion/CompanionPackageTypes';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ForegroundWindowInfo } from '../../../shared/system/ForegroundWindowInfo';
import type { GoogleSignInResult } from '../../../shared/auth/AccountTypes';
import type { PairedDevice } from '../../../shared/pairing/PairingTypes';
import type { LocalDeviceIdentity } from '../../../shared/device/DeviceTypes';
import type {
  PricingConfig,
  SubscriptionState,
  SubscriptionTierId,
  CreditBalance,
  BillingCheckoutResult,
  CheckoutOptions,
  FeatureId,
  EntitlementSnapshot,
} from '../../../shared/billing/BillingTypes';
import type { PawModelId } from '../../../shared/ai/PawModelTypes';
import type { OnboardingState } from '../../../shared/onboarding/OnboardingTypes';
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
import type { CommunicationRuntimeEvent, ParticipantRecord, CompanyRecord, CommunicationSummary, FollowUp } from '../../../shared/communication/CommunicationTypes';

export function contextBridge() {
  if (typeof window === 'undefined') {
    throw new Error('window is not defined');
  }

  const ipcApi = (window as any).electron?.ipcRenderer;


  function on(channel: string, cb: (...args: any[]) => void) {
    ipcApi?.on(channel, (_: any, payload: any) => cb(payload));
  }

  return {
    actionExecute: async (request: ActionRequest): Promise<ActionResult> => ipcApi.invoke('action:execute', request),
    processWriteStdin: async (processId: string, data: string): Promise<{ ok: true } | { ok: false; message: string }> =>
      ipcApi.invoke('process:writeStdin', processId, data),
    systemGetHomeDir: async (): Promise<string> => ipcApi.invoke('system:getHomeDir'),
    remoteAssistanceStartSharedTerminal: async (
      cwd: string,
      label: string
    ): Promise<{ ok: true; info: { id: string; pid: number | null } } | { ok: false; message: string }> =>
      ipcApi.invoke('remoteAssistance:startSharedTerminal', cwd, label),
    actionCheckRequirements: async (request: ActionRequest): Promise<ActionRequirement[]> =>
      ipcApi.invoke('action:checkRequirements', request),
    actionDescribe: async (request: ActionRequest): Promise<string> => ipcApi.invoke('action:describe', request),
    actionReportResult: async (request: ActionRequest, result: ActionResult): Promise<string> =>
      ipcApi.invoke('action:reportResult', request, result),
    assetsGetAnimationsBaseUrl: async (): Promise<string> => ipcApi.invoke('assets:getAnimationsBaseUrl'),
    assetsGetCharactersBaseUrl: async (): Promise<string> => ipcApi.invoke('assets:getCharactersBaseUrl'),

    companionEnable: async (): Promise<boolean> => ipcApi.invoke('companion:enable'),
    companionDisable: async (): Promise<boolean> => ipcApi.invoke('companion:disable'),
    companionIsEnabled: async (): Promise<boolean> => ipcApi.invoke('companion:isEnabled'),
    companionSendCommand: async (command: CompanionCommand): Promise<boolean> => ipcApi.invoke('companion:command', command),
    onCompanionCommand: (cb: (command: CompanionCommand) => void) => on('companion:command', cb),

    settingsGet: async (): Promise<SettingsState> => ipcApi.invoke('settings:get'),
    settingsSet: async (partial: Partial<SettingsState>) => ipcApi.invoke('settings:set', partial),

    petsList: async () => ipcApi.invoke('pets:list'),
    petsLoad: async (petId: string) => ipcApi.invoke('pets:load', petId),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => on('settings:updated', cb),
    onUiOpenSettings: (cb: () => void) => on('ui:open-settings', cb),

    feedbackSubmit: async (submission: FeedbackSubmission): Promise<boolean> => ipcApi.invoke('feedback:submit', submission),
    feedbackDismiss: async (opts: { dontAskAgain: boolean }): Promise<boolean> => ipcApi.invoke('feedback:dismiss', opts),
    onShowRatingPrompt: (cb: () => void) => on('feedback:showRatingPrompt', cb),
    mailSendOrganizationInvite: async (params: { to: string; organizationName: string; role: string; inviterName: string }): Promise<boolean> =>
      ipcApi.invoke('mail:sendOrganizationInvite', params),
    helpGetActivity: async (): Promise<HelpActivityState> => ipcApi.invoke('help:getActivity'),
    helpRecordArticleView: async (articleId: string): Promise<HelpActivityState> => ipcApi.invoke('help:recordArticleView', articleId),
    helpListConversations: async (): Promise<SupportConversation[]> => ipcApi.invoke('help:listConversations'),
    helpGetConversation: async (id: string): Promise<SupportConversation | null> => ipcApi.invoke('help:getConversation', id),
    helpCreateConversation: async (problemSummary: string): Promise<SupportConversation> => ipcApi.invoke('help:createConversation', problemSummary),
    helpAddTurn: async (id: string, turn: SupportConversationTurn): Promise<SupportConversation | null> => ipcApi.invoke('help:addTurn', id, turn),
    helpUpdateConversation: async (
      id: string,
      patch: { status?: SupportConversationStatus; diagnosis?: string; currentState?: string; needsPermission?: boolean; actionsTaken?: string[] }
    ): Promise<SupportConversation | null> => ipcApi.invoke('help:updateConversation', id, patch),
    helpSetConversationRating: async (id: string, rating: 'up' | 'down', detail?: string): Promise<SupportConversation | null> =>
      ipcApi.invoke('help:setConversationRating', id, rating, detail),

    overlayMoveWindow: async (x: number, y: number): Promise<boolean> => ipcApi.invoke('overlay:moveWindow', x, y),
    overlayGetWindowBounds: async (): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      ipcApi.invoke('overlay:getWindowBounds'),
    overlayGetScreenWorkArea: async (): Promise<{ width: number; height: number }> => ipcApi.invoke('overlay:getScreenWorkArea'),
    overlaySetInteractive: async (active: boolean): Promise<boolean> => ipcApi.invoke('overlay:setInteractive', active),

    envGetApiKeys: async (): Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string }> =>
      ipcApi.invoke('env:getApiKeys'),

    systemGetForegroundWindowInfo: async (): Promise<ForegroundWindowInfo> => ipcApi.invoke('system:getForegroundWindowInfo'),
    systemGetAppVersion: async (): Promise<string> => ipcApi.invoke('system:getAppVersion'),

    authIsGoogleSignInConfigured: async (): Promise<boolean> => ipcApi.invoke('auth:isGoogleSignInConfigured'),
    authStartGoogleSignIn: async (): Promise<GoogleSignInResult> => ipcApi.invoke('auth:startGoogleSignIn'),
    authSendOtp: async (email: string): Promise<{ expiresInMinutes: number }> => ipcApi.invoke('auth:sendOtp', email),
    authVerifyOtp: async (email: string, code: string): Promise<{ valid: boolean; reason?: string }> =>
      ipcApi.invoke('auth:verifyOtp', email, code),
    authSendPasswordResetOtp: async (email: string): Promise<{ expiresInMinutes: number }> =>
      ipcApi.invoke('auth:sendPasswordResetOtp', email),
    authVerifyPasswordResetOtp: async (email: string, code: string): Promise<{ valid: boolean; reason?: string; token?: string }> =>
      ipcApi.invoke('auth:verifyPasswordResetOtp', email, code),
    authValidatePasswordResetToken: async (token: string): Promise<{ valid: boolean; email?: string; reason?: string }> =>
      ipcApi.invoke('auth:validatePasswordResetToken', token),

    pairingBegin: async (userId?: string): Promise<{ token: string; pairingUri: string; qrDataUrl: string; expiresAt: number }> =>
      ipcApi.invoke('pairing:begin', userId),
    pairingComplete: async (
      token: string,
      deviceName: string,
      publicKey: string
    ): Promise<{ ok: true; device: PairedDevice } | { ok: false; reason: string }> =>
      ipcApi.invoke('pairing:complete', token, deviceName, publicKey),
    pairingList: async (userId?: string): Promise<PairedDevice[]> => ipcApi.invoke('pairing:list', userId),
    pairingRevoke: async (deviceId: string): Promise<boolean> => ipcApi.invoke('pairing:revoke', deviceId),

    deviceGetLocalIdentity: async (): Promise<LocalDeviceIdentity> => ipcApi.invoke('device:getLocalIdentity'),

    billingGetPricing: async (): Promise<PricingConfig> => ipcApi.invoke('billing:getPricing'),
    billingGetSubscription: async (): Promise<SubscriptionState> => ipcApi.invoke('billing:getSubscription'),
    billingSetSubscriptionTier: async (tier: SubscriptionTierId): Promise<SubscriptionState> =>
      ipcApi.invoke('billing:setSubscriptionTier', tier),
    billingSyncTierFromOrganization: async (orgTier: SubscriptionTierId): Promise<SubscriptionState> =>
      ipcApi.invoke('billing:syncFromOrganization', orgTier),
    billingGetCreditBalance: async (): Promise<CreditBalance> => ipcApi.invoke('billing:getCreditBalance'),
    billingConsumeCredit: async (amount: number, reason: string): Promise<CreditBalance> =>
      ipcApi.invoke('billing:consumeCredit', amount, reason),
    entitlementGetSnapshot: async (): Promise<EntitlementSnapshot> => ipcApi.invoke('entitlement:getSnapshot'),
    entitlementIsModelAvailable: async (modelId: PawModelId): Promise<boolean> =>
      ipcApi.invoke('entitlement:isModelAvailable', modelId),
    entitlementIsFeatureAvailable: async (featureId: FeatureId): Promise<boolean> =>
      ipcApi.invoke('entitlement:isFeatureAvailable', featureId),

    billingCreateCheckoutSession: async (tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions): Promise<BillingCheckoutResult> =>
      ipcApi.invoke('billing:createCheckoutSession', tier, callbackUrl, options),
    billingStartCheckoutSync: async (): Promise<string> => ipcApi.invoke('billing:startCheckoutSync'),
    billingCreateCreditsCheckoutSession: async (credits: number, organizationId?: string, callbackUrl?: string): Promise<BillingCheckoutResult> =>
      ipcApi.invoke('billing:createCreditsCheckoutSession', credits, organizationId, callbackUrl),
    onSubscriptionUpdated: (cb: () => void) => on('billing:subscriptionUpdated', cb),
    onTaskCreditsPurchased: (cb: (payload: { credits: number; organizationId?: string }) => void) =>
      on('billing:taskCreditsPurchased', cb),

    onboardingGet: async (): Promise<OnboardingState> => ipcApi.invoke('onboarding:get'),
    onboardingSetStep: async (step: number): Promise<OnboardingState> => ipcApi.invoke('onboarding:setStep', step),
    onboardingComplete: async (): Promise<OnboardingState> => ipcApi.invoke('onboarding:complete'),
    onboardingSelectWorkspaceFolder: async (): Promise<OnboardingState> => ipcApi.invoke('onboarding:selectWorkspaceFolder'),

    companionPickUploadFile: async (): Promise<string | null> => ipcApi.invoke('companion:pickUploadFile'),
    companionGetPathForFile: (file: File): string => ipcApi.invoke('companion:getPathForFile', file),
    companionShowNotification: async (title: string, body: string): Promise<boolean> =>
      ipcApi.invoke('companion:showNotification', title, body),
    companionExportPackage: async (input: CompanionPackageInput, suggestedName: string): Promise<string | null> =>
      ipcApi.invoke('companion:exportPackage', input, suggestedName),
    companionImportPackage: async (): Promise<ImportedCompanionPackage | null> => ipcApi.invoke('companion:importPackage'),

    mailSend: async (method: string, to: string, params: unknown): Promise<boolean> => ipcApi.invoke('mail:send', method, to, params),
    mailListTemplates: async (): Promise<{ key: string; label: string }[]> => ipcApi.invoke('mail:listTemplates'),
    mailRenderPreview: async (key: string): Promise<string> => ipcApi.invoke('mail:renderPreview', key),

    sessionsList: async (): Promise<ConversationSessionSummary[]> => ipcApi.invoke('sessions:list'),
    sessionsGet: async (id: string): Promise<ConversationSession | undefined> => ipcApi.invoke('sessions:get', id),
    sessionsSearch: async (query: string): Promise<ConversationSessionSummary[]> => ipcApi.invoke('sessions:search', query),
    sessionsAppendTurn: async (turn: ConversationSessionTurn, hint?: SessionContinuationHint): Promise<ConversationSession> =>
      ipcApi.invoke('sessions:appendTurn', turn, hint),
    sessionsRename: async (id: string, title: string): Promise<ConversationSession | undefined> =>
      ipcApi.invoke('sessions:rename', id, title),
    sessionsSetPinned: async (id: string, pinned: boolean): Promise<ConversationSession | undefined> =>
      ipcApi.invoke('sessions:setPinned', id, pinned),
    sessionsSetArchived: async (id: string, archived: boolean): Promise<ConversationSession | undefined> =>
      ipcApi.invoke('sessions:setArchived', id, archived),
    sessionsDelete: async (id: string): Promise<boolean> => ipcApi.invoke('sessions:delete', id),
    sessionsExport: async (id: string): Promise<string | undefined> => ipcApi.invoke('sessions:export', id),
    onSessionsUpdated: (cb: () => void) => on('sessions:updated', cb),

    executionRecord: async (record: ExecutionRecord): Promise<void> => ipcApi.invoke('execution:record', record),
    executionList: async (): Promise<ExecutionRecord[]> => ipcApi.invoke('execution:list'),
    browserGetCapabilities: async (): Promise<BrowserCapabilityReport[]> => ipcApi.invoke('browser:getCapabilities'),
    onExecutionUpdated: (cb: () => void) => on('execution:updated', cb),

    onProcessOutput: (cb: (event: ProcessOutputEvent) => void) => on('process:output', cb),
    onProcessExit: (cb: (event: ProcessExitEvent) => void) => on('process:exit', cb),
    onWorkspaceFileChanged: (cb: (event: WorkspaceFileChangeEvent) => void) => on('workspace:fileChanged', cb),
    onWorkspaceObservation: (cb: (event: WorkspaceObservationEvent) => void) => on('workspace:observation', cb),

    communicationSaveAudio: async (communicationId: string, base64Data: string, mimeType: string): Promise<{ ok: boolean; data?: { audioPath: string }; message?: string }> =>
      ipcApi.invoke('communication:saveAudio', communicationId, base64Data, mimeType),
    onCommunicationEvent: (cb: (event: CommunicationRuntimeEvent) => void) => on('communication:event', cb),
    communicationListLocalParticipants: async (): Promise<ParticipantRecord[]> => ipcApi.invoke('communication:listLocalParticipants'),
    communicationListLocalCompanies: async (): Promise<CompanyRecord[]> => ipcApi.invoke('communication:listLocalCompanies'),
    communicationListLocalSummaries: async (): Promise<CommunicationSummary[]> => ipcApi.invoke('communication:listLocalSummaries'),
    communicationListLocalFollowUps: async (): Promise<FollowUp[]> => ipcApi.invoke('communication:listLocalFollowUps'),
  };
}

