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
import type { LocalDeviceIdentity } from '../../../shared/device/DeviceTypes';
import type { PushNotificationPayload, PushSendResult } from '../../../shared/mobilePresence/MobilePresenceTypes';
import type {
  PricingConfig,
  TicketPricingConfig,
  SubscriptionState,
  SubscriptionTierId,
  CreditBalance,
  CreditConsumptionRecord,
  BillingCheckoutResult,
  NativePaymentMethodsResult,
  NativeSubscriptionCheckoutResult,
  NativeCreditsCheckoutResult,
  NativeCreditsVerificationResult,
  NativeTierCheckoutResult,
  NativeTierVerificationResult,
  CheckoutOptions,
  FeatureId,
  EntitlementSnapshot,
  SeatTier,
} from '../../../shared/billing/BillingTypes';
import type { AiUsageCategory } from '../../../shared/billing/AiUsageCategories';
import type {
  TurnUsageSubmission,
  AggregatedTurnUsage,
  NormalizedUsageRecord,
  ProviderUsageMetadata,
  UsageRequestType,
} from '../../../shared/billing/UsageMeteringTypes';
import {
  ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL,
  ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX,
  type OrganizationUsageRecordRequest,
  type OrganizationUsageRecordResponse,
} from '../../../shared/billing/OrganizationUsageBridgeTypes';
import {
  CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX,
  CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX,
  type ConnectivityCredentialPersistRequest,
  type ConnectivityCredentialPersistResponse,
  type ConnectivityCredentialRevokeRequest,
  type ConnectivityCredentialRevokeResponse,
} from '../../../shared/connectivity/ConnectivityCredentialBridgeTypes';
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
import type { CommunicationRuntimeEvent, ParticipantRecord, CompanyRecord, CommunicationSummary, FollowUp, RecordingTimelineEntry, EvidenceObject, BusinessInsight } from '../../../shared/communication/CommunicationTypes';
import type {
  ConnectivityScope,
  ConnectorDefinition,
  ConnectorConnection,
  ConnectorStatus,
  DeploymentProfile,
  DeploymentProfileConfig,
  ConnectivityIpcResult,
  ApiTokenValidationResult,
  OAuthBeginResult,
} from '../../../shared/connectivity/ConnectivityTypes';
import type { SecurityKeyChallenge } from '../../../shared/mobilePresence/MobileAuthTypes';

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
    onOrganizationUsageRecordRequest: (cb: (request: OrganizationUsageRecordRequest) => void) => {
      const handler = (_: any, request: OrganizationUsageRecordRequest) => cb(request);
      ipcApi?.on(ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL, handler);
      return () => ipcApi?.removeListener?.(ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL, handler);
    },
    organizationUsageRecordRespond: async (requestId: string, response: OrganizationUsageRecordResponse): Promise<void> =>
      ipcApi.invoke(`${ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response),
    onConnectivityCredentialPersistRequest: (cb: (request: ConnectivityCredentialPersistRequest) => void) => {
      const handler = (_: any, request: ConnectivityCredentialPersistRequest) => cb(request);
      ipcApi?.on(CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL, handler);
      return () => ipcApi?.removeListener?.(CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL, handler);
    },
    connectivityCredentialPersistRespond: async (requestId: string, response: ConnectivityCredentialPersistResponse): Promise<void> =>
      ipcApi.invoke(`${CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response),
    onConnectivityCredentialRevokeRequest: (cb: (request: ConnectivityCredentialRevokeRequest) => void) => {
      const handler = (_: any, request: ConnectivityCredentialRevokeRequest) => cb(request);
      ipcApi?.on(CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL, handler);
      return () => ipcApi?.removeListener?.(CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL, handler);
    },
    connectivityCredentialRevokeRespond: async (requestId: string, response: ConnectivityCredentialRevokeResponse): Promise<void> =>
      ipcApi.invoke(`${CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response),
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
    companionNotifyReady: () => ipcApi?.send('companion:ready'),
    onCompanionReady: (cb: () => void) => on('companion:ready:broadcast', cb),
    reportPlatformRendererEvent: (payload: { message: string; stack?: string }) =>
      ipcApi?.send('platform:reportRendererEvent', payload),

    settingsGet: async (): Promise<SettingsState> => ipcApi.invoke('settings:get'),
    settingsSet: async (partial: Partial<SettingsState>) => ipcApi.invoke('settings:set', partial),

    petsList: async () => ipcApi.invoke('pets:list'),
    petsLoad: async (petId: string) => ipcApi.invoke('pets:load', petId),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => on('settings:updated', cb),
    onUiOpenSettings: (cb: () => void) => on('ui:open-settings', cb),
    openUpgradeInDashboard: () => ipcApi?.send('ui:open-upgrade'),
    onUiNavigateUpgrade: (cb: () => void) => on('ui:navigate-upgrade', cb),

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

    envGetApiKeys: async (): Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string; githubRedirectUri?: string }> =>
      ipcApi.invoke('env:getApiKeys'),

    systemGetForegroundWindowInfo: async (): Promise<ForegroundWindowInfo> => ipcApi.invoke('system:getForegroundWindowInfo'),
    systemGetAppVersion: async (): Promise<string> => ipcApi.invoke('system:getAppVersion'),

    authIsGoogleSignInConfigured: async (): Promise<boolean> => ipcApi.invoke('auth:isGoogleSignInConfigured'),
    authStartGoogleSignIn: async (): Promise<GoogleSignInResult> => ipcApi.invoke('auth:startGoogleSignIn'),
    authIsGithubSignInConfigured: async (): Promise<boolean> => ipcApi.invoke('auth:isGithubSignInConfigured'),
    authStartGithubSignIn: async (authorizeUrl: string): Promise<{ code: string }> =>
      ipcApi.invoke('auth:startGithubSignIn', authorizeUrl),
    authIsMicrosoftSignInConfigured: async (): Promise<boolean> => ipcApi.invoke('auth:isMicrosoftSignInConfigured'),
    authStartMicrosoftSignIn: async (): Promise<{ profile: any; idToken: string; accessToken: string }> =>
      ipcApi.invoke('auth:startMicrosoftSignIn'),
    authSendOtp: async (email: string): Promise<{ expiresInMinutes: number }> => ipcApi.invoke('auth:sendOtp', email),
    authVerifyOtp: async (email: string, code: string): Promise<{ valid: boolean; reason?: string }> =>
      ipcApi.invoke('auth:verifyOtp', email, code),
    authSendPasswordResetOtp: async (email: string): Promise<{ expiresInMinutes: number }> =>
      ipcApi.invoke('auth:sendPasswordResetOtp', email),
    authVerifyPasswordResetOtp: async (email: string, code: string): Promise<{ valid: boolean; reason?: string; token?: string }> =>
      ipcApi.invoke('auth:verifyPasswordResetOtp', email, code),
    authValidatePasswordResetToken: async (token: string): Promise<{ valid: boolean; email?: string; reason?: string }> =>
      ipcApi.invoke('auth:validatePasswordResetToken', token),

    deviceGetLocalIdentity: async (): Promise<LocalDeviceIdentity> => ipcApi.invoke('device:getLocalIdentity'),

    notificationsSendPush: async (
      subscription: { endpoint: string; p256dh: string; authKey: string },
      payload: PushNotificationPayload
    ): Promise<PushSendResult> => ipcApi.invoke('notifications:sendPush', subscription, payload),

    billingGetPricing: async (): Promise<PricingConfig> => ipcApi.invoke('billing:getPricing'),
    billingGetTicketPricingConfig: async (): Promise<TicketPricingConfig> => ipcApi.invoke('billing:getTicketPricingConfig'),
    billingGetGooglePlacesApiKey: async (): Promise<string> => ipcApi.invoke('billing:getGooglePlacesApiKey'),
    billingGetSubscription: async (): Promise<SubscriptionState> => ipcApi.invoke('billing:getSubscription'),
    billingSetSubscriptionTier: async (tier: SubscriptionTierId): Promise<SubscriptionState> =>
      ipcApi.invoke('billing:setSubscriptionTier', tier),
    billingSyncTierFromOrganization: async (accessToken: string, organizationId: string, seatTier?: SeatTier): Promise<SubscriptionState> =>
      ipcApi.invoke('billing:syncFromOrganization', accessToken, organizationId, seatTier),
    billingReconcileForAccount: async (accountId: string): Promise<SubscriptionState> =>
      ipcApi.invoke('billing:reconcileForAccount', accountId),
    billingResetSubscription: async (): Promise<SubscriptionState> => ipcApi.invoke('billing:resetSubscription'),
    billingGetCreditBalance: async (): Promise<CreditBalance> => ipcApi.invoke('billing:getCreditBalance'),
    billingCanStartGeneration: async (pawModelId?: PawModelId): Promise<{ allowed: boolean; reason?: string; pooled?: boolean }> =>
      ipcApi.invoke('billing:canStartGeneration', pawModelId),
    billingConsumeCredit: async (amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId): Promise<CreditBalance> =>
      ipcApi.invoke('billing:consumeCredit', amount, reason, category, pawModelId),
    billingRecordTurnUsage: async (
      submission: TurnUsageSubmission,
      reason: string,
      category?: AiUsageCategory,
      pawModelId?: PawModelId
    ): Promise<{ aggregated: AggregatedTurnUsage; balance: CreditBalance }> =>
      ipcApi.invoke('billing:recordTurnUsage', submission, reason, category, pawModelId),
    billingReportUsageEvent: async (
      usage: ProviderUsageMetadata,
      requestType: UsageRequestType,
      context: { sessionId: string | null; runId: string | null }
    ): Promise<NormalizedUsageRecord> => ipcApi.invoke('billing:reportUsageEvent', usage, requestType, context),
    billingGetUsageEvents: async (limit?: number): Promise<NormalizedUsageRecord[]> => ipcApi.invoke('billing:getUsageEvents', limit),
    billingGetCreditHistory: async (): Promise<CreditConsumptionRecord[]> => ipcApi.invoke('billing:getCreditHistory'),
    billingGrantComputeBonus: async (units: number): Promise<EntitlementSnapshot> => ipcApi.invoke('billing:grantComputeBonus', units),
    entitlementGetSnapshot: async (): Promise<EntitlementSnapshot> => ipcApi.invoke('entitlement:getSnapshot'),
    entitlementIsModelAvailable: async (modelId: PawModelId): Promise<boolean> =>
      ipcApi.invoke('entitlement:isModelAvailable', modelId),
    entitlementIsFeatureAvailable: async (featureId: FeatureId): Promise<boolean> =>
      ipcApi.invoke('entitlement:isFeatureAvailable', featureId),
    entitlementGetModelTierRequirements: async (): Promise<Partial<Record<PawModelId, SubscriptionTierId>>> =>
      ipcApi.invoke('entitlement:getModelTierRequirements'),
    entitlementGetFeatureTierRequirements: async (): Promise<Partial<Record<FeatureId, SubscriptionTierId>>> =>
      ipcApi.invoke('entitlement:getFeatureTierRequirements'),

    billingCreateCheckoutSession: async (tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions): Promise<BillingCheckoutResult> =>
      ipcApi.invoke('billing:createCheckoutSession', tier, callbackUrl, options),
    billingGetNativePaymentMethods: async (accessToken?: string): Promise<NativePaymentMethodsResult> =>
      ipcApi.invoke('billing:getNativePaymentMethods', accessToken),
    billingCreateNativeSubscriptionCheckout: async (tier: SubscriptionTierId, options?: CheckoutOptions, accessToken?: string): Promise<NativeSubscriptionCheckoutResult> =>
      ipcApi.invoke('billing:createNativeSubscriptionCheckout', tier, options, accessToken),
    billingConfirmNativeSubscriptionPayment: async (paymentId: string, subscriptionId: string, signature: string, accessToken?: string): Promise<{ ok: true; subscription: SubscriptionState } | { ok: false; reason: string }> =>
      ipcApi.invoke('billing:confirmNativeSubscriptionPayment', paymentId, subscriptionId, signature, accessToken),
    billingStartCheckoutSync: async (): Promise<string> => ipcApi.invoke('billing:startCheckoutSync'),
    billingCreateCreditsCheckoutSession: async (amountUsd: number, organizationId?: string, callbackUrl?: string, accessToken?: string): Promise<BillingCheckoutResult> =>
      ipcApi.invoke('billing:createCreditsCheckoutSession', amountUsd, organizationId, callbackUrl, accessToken),
    billingCreateNativeCreditsCheckout: async (amountUsd: number, organizationId?: string, accessToken?: string): Promise<NativeCreditsCheckoutResult> =>
      ipcApi.invoke('billing:createNativeCreditsCheckout', amountUsd, organizationId, accessToken),
    billingVerifyNativeCreditsPayment: async (params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }): Promise<NativeCreditsVerificationResult> =>
      ipcApi.invoke('billing:verifyNativeCreditsPayment', params),
    billingCreateNativeUsageCreditsCheckout: async (amountUsd: number, organizationId?: string, accessToken?: string): Promise<NativeCreditsCheckoutResult> =>
      ipcApi.invoke('billing:createNativeUsageCreditsCheckout', amountUsd, organizationId, accessToken),
    billingVerifyNativeUsageCreditsPayment: async (params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }): Promise<NativeCreditsVerificationResult> =>
      ipcApi.invoke('billing:verifyNativeUsageCreditsPayment', params),
    billingCreateNativeTierCheckout: async (tier: SubscriptionTierId, options?: CheckoutOptions, organizationId?: string, accessToken?: string): Promise<NativeTierCheckoutResult> =>
      ipcApi.invoke('billing:createNativeTierCheckout', tier, options, organizationId, accessToken),
    billingVerifyNativeTierPayment: async (params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string; tier: SubscriptionTierId; seatCount?: number; seatTier?: SeatTier }): Promise<NativeTierVerificationResult> =>
      ipcApi.invoke('billing:verifyNativeTierPayment', params),
    billingCreateHighValueInvoices: async (params: { plan: string; seatTier?: string; seatCount: number; customerName: string; organizationName: string; gstNumber?: string; accessToken?: string }): Promise<any> =>
      ipcApi.invoke('billing:createHighValueInvoices', params),
    onSubscriptionUpdated: (cb: () => void) => on('billing:subscriptionUpdated', cb),
    onTaskCreditsPurchased: (cb: (payload: { amountUsd?: number; organizationId?: string }) => void) =>
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
    executionSetSelected: async (executionId: string | null): Promise<{ ok: boolean }> => ipcApi.invoke('execution:setSelected', executionId),
    executionGetSelected: async (): Promise<string | null> => ipcApi.invoke('execution:getSelected'),
    browserGetCapabilities: async (): Promise<BrowserCapabilityReport[]> => ipcApi.invoke('browser:getCapabilities'),
    onExecutionUpdated: (cb: () => void) => on('execution:updated', cb),

    onProcessOutput: (cb: (event: ProcessOutputEvent) => void) => on('process:output', cb),
    onProcessExit: (cb: (event: ProcessExitEvent) => void) => on('process:exit', cb),
    onWorkspaceFileChanged: (cb: (event: WorkspaceFileChangeEvent) => void) => on('workspace:fileChanged', cb),
    onWorkspaceObservation: (cb: (event: WorkspaceObservationEvent) => void) => on('workspace:observation', cb),

    communicationSaveAudio: async (communicationId: string, base64Data: string, mimeType: string): Promise<{ ok: boolean; data?: { audioPath: string }; message?: string }> =>
      ipcApi.invoke('communication:saveAudio', communicationId, base64Data, mimeType),
    communicationAppendRecordingChunk: async (communicationId: string, kind: 'audio' | 'video', base64Chunk: string, expectedChecksum?: string): Promise<{ ok: boolean; message?: string }> =>
      ipcApi.invoke('communication:appendRecordingChunk', communicationId, kind, base64Chunk, expectedChecksum),
    communicationFinalizeRecording: async (
      communicationId: string,
      kind: 'audio' | 'video',
      mimeType: string
    ): Promise<{ ok: boolean; data?: { path: string; sizeBytes: number; checksum: string } | null; message?: string }> =>
      ipcApi.invoke('communication:finalizeRecording', communicationId, kind, mimeType),
    communicationGetRecordingDiagnostics: async (communicationId: string): Promise<Record<string, unknown> | null> =>
      ipcApi.invoke('communication:getRecordingDiagnostics', communicationId),
    communicationDeleteRecording: async (communicationId: string): Promise<{ ok: boolean; message?: string }> =>
      ipcApi.invoke('communication:deleteRecording', communicationId),
    communicationGetRecordingTimeline: async (communicationId: string): Promise<RecordingTimelineEntry[]> =>
      ipcApi.invoke('communication:getRecordingTimeline', communicationId),
    communicationGenerateEvidence: async (
      communicationId: string,
      apiKey: string,
      model?: string,
      baseUrl?: string
    ): Promise<{ ok: boolean; data?: { evidenceCount: number }; message?: string }> =>
      ipcApi.invoke('communication:generateEvidence', communicationId, apiKey, model, baseUrl),
    communicationGetEvidence: async (communicationId: string): Promise<EvidenceObject[]> =>
      ipcApi.invoke('communication:getEvidence', communicationId),
    communicationGenerateBusinessInsights: async (
      communicationId: string,
      apiKey: string,
      model?: string,
      baseUrl?: string
    ): Promise<{ ok: boolean; data?: { insightCount: number }; message?: string }> =>
      ipcApi.invoke('communication:generateBusinessInsights', communicationId, apiKey, model, baseUrl),
    communicationGetBusinessInsights: async (communicationId: string): Promise<BusinessInsight[]> =>
      ipcApi.invoke('communication:getBusinessInsights', communicationId),
    onCommunicationEvent: (cb: (event: CommunicationRuntimeEvent) => void) => on('communication:event', cb),
    communicationListLocalParticipants: async (): Promise<ParticipantRecord[]> => ipcApi.invoke('communication:listLocalParticipants'),
    communicationListLocalCompanies: async (): Promise<CompanyRecord[]> => ipcApi.invoke('communication:listLocalCompanies'),
    communicationListLocalSummaries: async (): Promise<CommunicationSummary[]> => ipcApi.invoke('communication:listLocalSummaries'),
    communicationListLocalFollowUps: async (): Promise<FollowUp[]> => ipcApi.invoke('communication:listLocalFollowUps'),

    connectivityListConnectors: async (): Promise<ConnectivityIpcResult<ConnectorDefinition[]>> => ipcApi.invoke('connectivity:listConnectors'),
    connectivityListConnections: async (scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorConnection[]>> =>
      ipcApi.invoke('connectivity:listConnections', scope),
    connectivityConnect: async (connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorConnection>> =>
      ipcApi.invoke('connectivity:connect', connectorId, scope),
    connectivityGetStatus: async (connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorStatus>> =>
      ipcApi.invoke('connectivity:getStatus', connectorId, scope),
    connectivityRestore: async (connectorId: string, scope: ConnectivityScope, credential: unknown): Promise<ConnectivityIpcResult<ConnectorStatus>> =>
      ipcApi.invoke('connectivity:restore', connectorId, scope, credential),
    connectivityDisconnect: async (connectionId: string): Promise<ConnectivityIpcResult<void>> =>
      ipcApi.invoke('connectivity:disconnect', connectionId),
    connectivityCheckHealth: async (connectionId: string): Promise<ConnectivityIpcResult<ConnectorConnection>> =>
      ipcApi.invoke('connectivity:checkHealth', connectionId),
    connectivityRefreshDiscovery: async (): Promise<ConnectivityIpcResult<void>> => ipcApi.invoke('connectivity:refreshDiscovery'),
    connectivityVerifyPullRequestExists: async (prUrl: string): Promise<ConnectivityIpcResult<{ verified: boolean; reason: string }>> =>
      ipcApi.invoke('connectivity:verifyPullRequestExists', prUrl),
    connectivityPostAutonomousCompletionComment: async (prUrl: string, body: string): Promise<ConnectivityIpcResult<{ posted: boolean; reason: string; commentUrl?: string }>> =>
      ipcApi.invoke('connectivity:postAutonomousCompletionComment', prUrl, body),
    connectivityDeploymentProfilesCreate: async (
      scope: ConnectivityScope,
      name: string,
      config: DeploymentProfileConfig
    ): Promise<ConnectivityIpcResult<DeploymentProfile>> => ipcApi.invoke('connectivity:deploymentProfiles:create', scope, name, config),
    connectivityDeploymentProfilesGet: async (profileId: string): Promise<ConnectivityIpcResult<DeploymentProfile | undefined>> =>
      ipcApi.invoke('connectivity:deploymentProfiles:get', profileId),
    connectivityDeploymentProfilesList: async (scope: ConnectivityScope): Promise<ConnectivityIpcResult<DeploymentProfile[]>> =>
      ipcApi.invoke('connectivity:deploymentProfiles:list', scope),
    connectivityDeploymentProfilesUpdate: async (
      profileId: string,
      patch: Partial<Pick<DeploymentProfile, 'name' | 'config' | 'isDefault'>>
    ): Promise<ConnectivityIpcResult<DeploymentProfile>> => ipcApi.invoke('connectivity:deploymentProfiles:update', profileId, patch),
    connectivityDeploymentProfilesRemove: async (profileId: string): Promise<ConnectivityIpcResult<void>> =>
      ipcApi.invoke('connectivity:deploymentProfiles:remove', profileId),
    connectivityApiTokensValidate: async (connectorId: string, token: string): Promise<ConnectivityIpcResult<ApiTokenValidationResult>> =>
      ipcApi.invoke('connectivity:apiTokens:validate', connectorId, token),
    connectivityApiTokensSave: async (connectorId: string, scope: ConnectivityScope, token: string): Promise<ConnectivityIpcResult<void>> =>
      ipcApi.invoke('connectivity:apiTokens:save', connectorId, scope, token),
    connectivityOAuthBegin: async (connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<OAuthBeginResult>> =>
      ipcApi.invoke('connectivity:oauth:begin', connectorId, scope),
    connectivityOAuthCancel: async (requestId: string): Promise<ConnectivityIpcResult<void>> =>
      ipcApi.invoke('connectivity:oauth:cancel', requestId),
    connectivityDeploymentProfilesHydrate: async (profile: DeploymentProfile): Promise<ConnectivityIpcResult<void>> =>
      ipcApi.invoke('connectivity:deploymentProfiles:hydrate', profile),
    connectivityGetStoredCredential: async (connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<{ secret: string; authMethod: string } | undefined>> =>
      ipcApi.invoke('connectivity:getStoredCredential', connectorId, scope),
    connectivityGetJiraMetadata: async (scope: ConnectivityScope): Promise<ConnectivityIpcResult<{ cloudId: string; siteUrl: string; siteName: string } | undefined>> =>
      ipcApi.invoke('connectivity:getJiraMetadata', scope),
    autonomousVerifyRun: async (input: { runId: string; approved: boolean; verifierNotes?: string }): Promise<{ ok: boolean; reason?: string; billingEventId?: string }> =>
      ipcApi.invoke('autonomous:verifyRun', input),
    adminApplyTestTier: async (input: { tier: string; userEmail: string; userId: string }): Promise<{ ok: boolean; reason?: string; override?: { realTier: string; testTier: string; appliedAt: number } }> =>
      ipcApi.invoke('admin:applyTestTier', input),
    adminClearTestTier: async (input: { userId: string; userEmail: string }): Promise<{ ok: boolean; reason?: string }> =>
      ipcApi.invoke('admin:clearTestTier', input),
    adminGetTestTier: async (userId: string, userEmail: string): Promise<{ ok: boolean; reason?: string; override?: { realTier: string; testTier: string; appliedAt: number } }> =>
      ipcApi.invoke('admin:getTestTier', userId, userEmail),
    adminHydrateTestTier: async (input: { userId: string; realTier: string; testTier: string }): Promise<{ ok: boolean; reason?: string }> =>
      ipcApi.invoke('admin:hydrateTestTier', input),

    // Enterprise Billing — Inquiry & Checkout
    enterpriseSubmitInquiry: async (request: { name: string; email: string; company: string; phone: string; seatsNeeded: number; message?: string }): Promise<{ ok: boolean; inquiryId?: string; reason?: string }> =>
      ipcApi.invoke('enterprise:submitInquiry', request),
    enterpriseCreateOrder: async (request: { inquiryId?: string; seatsCount: number; spendingLimitPerUserCents: number; startingBalanceCents: number }): Promise<{ ok: boolean; orderId?: string; totalDueCents?: number; invoiceNumber?: string; reason?: string }> =>
      ipcApi.invoke('enterprise:createOrder', request),
    enterpriseGetInquiry: async (inquiryId: string): Promise<{ ok: boolean; inquiry?: { id: string; name: string; email: string; company: string; seatsNeeded: number; status: string; createdAt: string }; reason?: string }> =>
      ipcApi.invoke('enterprise:getInquiry', inquiryId),

    // Mobile Authentication & Pairing (Phase 2)
    mobileAuth__getWebAuthorizationUrl: async (sessionId: string): Promise<string> =>
      ipcApi.invoke('mobileAuth:getWebAuthorizationUrl', sessionId),
    mobileAuth__generateSecurityKey: async (sessionId: string): Promise<SecurityKeyChallenge> =>
      ipcApi.invoke('mobileAuth:generateSecurityKey', sessionId),
    mobileAuth__verifySecurityKey: async (sessionId: string, keyPlain: string): Promise<{ success: boolean; deviceId?: string; sessionToken?: string; expiresAt?: string; error?: string }> =>
      ipcApi.invoke('mobileAuth:verifySecurityKey', sessionId, keyPlain),

    // Governance & Approval Handler
    governanceApprove: async (approvalId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcApi.invoke('governance:approve', approvalId),
    governanceDeny: async (approvalId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcApi.invoke('governance:deny', approvalId),
    governanceGetPending: async (): Promise<Array<{ approvalId: string; actionType: string; requestedAt: number }>> =>
      ipcApi.invoke('governance:getPending'),
    onGovernanceApproved: (cb: (payload: { approvalId: string }) => void) =>
      on('governance:approved', cb),
    onGovernanceDenied: (cb: (payload: { approvalId: string }) => void) =>
      on('governance:denied', cb),
  };
}
