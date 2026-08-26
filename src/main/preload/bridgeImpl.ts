import {
  contextBridge as electronContextBridge,
  ipcRenderer,
  webUtils,
} from "electron";

import type {
  SettingsState,
  FeedbackSubmission,
  HelpActivityState,
  SupportConversation,
  SupportConversationTurn,
  SupportConversationStatus,
} from "../../renderer/services/ipc/ipcTypes";
import type { CompanionCommand } from "../../shared/companion/CompanionCommand";
import type { CompanionPackageInput, ImportedCompanionPackage } from "../../shared/companion/CompanionPackageTypes";
import type { ActionRequest, ActionRequirement, ActionResult } from "../../shared/actions/ActionTypes";
import type { ProcessOutputEvent, ProcessExitEvent } from "../../shared/actions/ProcessTypes";
import type { WorkspaceFileChangeEvent } from "../../shared/actions/WorkspaceFileChangeTypes";
import type { WorkspaceObservationEvent } from "../../shared/actions/ExecutionLifecycle";
import type { ExecutionRecord } from "../../shared/actions/ExecutionRecordTypes";
import type { BrowserCapabilityReport } from "../../shared/actions/BrowserCapabilityTypes";
import type { CommunicationRuntimeEvent, ParticipantRecord, CompanyRecord, CommunicationSummary, FollowUp, RecordingTimelineEntry, EvidenceObject, BusinessInsight } from "../../shared/communication/CommunicationTypes";
import type { ForegroundWindowInfo } from "../../shared/system/ForegroundWindowInfo";
import type { GoogleSignInResult } from "../../shared/auth/AccountTypes";
import type { LocalDeviceIdentity } from "../../shared/device/DeviceTypes";
import type { PushNotificationPayload, PushSendResult } from "../../shared/mobilePresence/MobilePresenceTypes";
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
} from "../../shared/connectivity/ConnectivityTypes";
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
  CheckoutOptions,
  FeatureId,
  EntitlementSnapshot,
  SeatTier,
} from "../../shared/billing/BillingTypes";
import type { AiUsageCategory } from "../../shared/billing/AiUsageCategories";
import type {
  TurnUsageSubmission,
  AggregatedTurnUsage,
  NormalizedUsageRecord,
  ProviderUsageMetadata,
  UsageRequestType,
} from "../../shared/billing/UsageMeteringTypes";
import {
  ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL,
  ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX,
  type OrganizationUsageRecordRequest,
  type OrganizationUsageRecordResponse,
} from "../../shared/billing/OrganizationUsageBridgeTypes";
import {
  CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX,
  CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX,
  type ConnectivityCredentialPersistRequest,
  type ConnectivityCredentialPersistResponse,
  type ConnectivityCredentialRevokeRequest,
  type ConnectivityCredentialRevokeResponse,
} from "../../shared/connectivity/ConnectivityCredentialBridgeTypes";
import type { PawModelId } from "../../shared/ai/PawModelTypes";
import type { OnboardingState } from "../../shared/onboarding/OnboardingTypes";
import type {
  ConversationSession,
  ConversationSessionSummary,
  ConversationSessionTurn,
  SessionContinuationHint,
} from "../../shared/conversation/ConversationSessionTypes";

export function contextBridge() {
  const api = {
    actionExecute: (request: ActionRequest) => ipcRenderer.invoke("action:execute", request) as Promise<ActionResult>,
    onOrganizationUsageRecordRequest: (cb: (request: OrganizationUsageRecordRequest) => void) => {
      const handler = (_: Electron.IpcRendererEvent, request: OrganizationUsageRecordRequest) => cb(request);
      ipcRenderer.on(ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL, handler);
      return () => ipcRenderer.removeListener(ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL, handler);
    },
    organizationUsageRecordRespond: (requestId: string, response: OrganizationUsageRecordResponse) =>
      ipcRenderer.invoke(`${ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response) as Promise<void>,
    onConnectivityCredentialPersistRequest: (cb: (request: ConnectivityCredentialPersistRequest) => void) => {
      const handler = (_: Electron.IpcRendererEvent, request: ConnectivityCredentialPersistRequest) => cb(request);
      ipcRenderer.on(CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL, handler);
      return () => ipcRenderer.removeListener(CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL, handler);
    },
    connectivityCredentialPersistRespond: (requestId: string, response: ConnectivityCredentialPersistResponse) =>
      ipcRenderer.invoke(`${CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response) as Promise<void>,
    onConnectivityCredentialRevokeRequest: (cb: (request: ConnectivityCredentialRevokeRequest) => void) => {
      const handler = (_: Electron.IpcRendererEvent, request: ConnectivityCredentialRevokeRequest) => cb(request);
      ipcRenderer.on(CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL, handler);
      return () => ipcRenderer.removeListener(CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL, handler);
    },
    connectivityCredentialRevokeRespond: (requestId: string, response: ConnectivityCredentialRevokeResponse) =>
      ipcRenderer.invoke(`${CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX}:${requestId}`, response) as Promise<void>,
    processWriteStdin: (processId: string, data: string) =>
      ipcRenderer.invoke("process:writeStdin", processId, data) as Promise<{ ok: true } | { ok: false; message: string }>,
    systemGetHomeDir: () => ipcRenderer.invoke("system:getHomeDir") as Promise<string>,
    remoteAssistanceStartSharedTerminal: (cwd: string, label: string) =>
      ipcRenderer.invoke("remoteAssistance:startSharedTerminal", cwd, label) as Promise<
        { ok: true; info: { id: string; pid: number | null } } | { ok: false; message: string }
      >,
    actionCheckRequirements: (request: ActionRequest) =>
      ipcRenderer.invoke("action:checkRequirements", request) as Promise<ActionRequirement[]>,
    actionDescribe: (request: ActionRequest) => ipcRenderer.invoke("action:describe", request) as Promise<string>,
    actionReportResult: (request: ActionRequest, result: ActionResult) =>
      ipcRenderer.invoke("action:reportResult", request, result) as Promise<string>,
    assetsGetAnimationsBaseUrl: () => ipcRenderer.invoke("assets:getAnimationsBaseUrl") as Promise<string>,
    assetsGetCharactersBaseUrl: () => ipcRenderer.invoke("assets:getCharactersBaseUrl") as Promise<string>,
    companionEnable: () => ipcRenderer.invoke("companion:enable") as Promise<boolean>,
    companionDisable: () => ipcRenderer.invoke("companion:disable") as Promise<boolean>,
    companionIsEnabled: () => ipcRenderer.invoke("companion:isEnabled") as Promise<boolean>,
    companionSendCommand: (command: CompanionCommand) => ipcRenderer.invoke("companion:command", command) as Promise<boolean>,
    onCompanionCommand: (cb: (command: CompanionCommand) => void) => {
      ipcRenderer.on("companion:command", (_: any, payload: CompanionCommand) => cb(payload));
    },
    companionNotifyReady: () => ipcRenderer.send("companion:ready"),
    onCompanionReady: (cb: () => void) => {
      ipcRenderer.on("companion:ready:broadcast", () => cb());
    },
    // Fire-and-forget, mirroring companionNotifyReady's shape — the renderer
    // crash guard (src/renderer/platform/RendererCrashGuard.ts) forwards
    // window-level errors/rejections here; the main process turns each one
    // into a real Platform Runtime crash event (see ipc.ts).
    reportPlatformRendererEvent: (payload: { message: string; stack?: string }) =>
      ipcRenderer.send("platform:reportRendererEvent", payload),

    settingsGet: () => ipcRenderer.invoke("settings:get") as Promise<SettingsState>,
    settingsSet: (partial: Partial<SettingsState>) =>
      ipcRenderer.invoke("settings:set", partial) as Promise<SettingsState>,

    petsList: () => ipcRenderer.invoke("pets:list") as Promise<Array<{ id: string; name: string }>>,
    petsLoad: (petId: string) => ipcRenderer.invoke("pets:load", petId),

    onSettingsUpdated: (cb: (s: SettingsState) => void) => {
      ipcRenderer.on("settings:updated", (_: any, payload: SettingsState) => cb(payload));
    },

    feedbackSubmit: (submission: FeedbackSubmission) => ipcRenderer.invoke("feedback:submit", submission) as Promise<boolean>,
    feedbackDismiss: (opts: { dontAskAgain: boolean }) => ipcRenderer.invoke("feedback:dismiss", opts) as Promise<boolean>,
    onShowRatingPrompt: (cb: () => void) => {
      ipcRenderer.on("feedback:showRatingPrompt", () => cb());
    },
    mailSendOrganizationInvite: (params: { to: string; organizationName: string; role: string; inviterName: string }) =>
      ipcRenderer.invoke("mail:sendOrganizationInvite", params) as Promise<boolean>,
    helpGetActivity: () => ipcRenderer.invoke("help:getActivity") as Promise<HelpActivityState>,
    helpRecordArticleView: (articleId: string) => ipcRenderer.invoke("help:recordArticleView", articleId) as Promise<HelpActivityState>,
    helpListConversations: () => ipcRenderer.invoke("help:listConversations") as Promise<SupportConversation[]>,
    helpGetConversation: (id: string) => ipcRenderer.invoke("help:getConversation", id) as Promise<SupportConversation | null>,
    helpCreateConversation: (problemSummary: string) => ipcRenderer.invoke("help:createConversation", problemSummary) as Promise<SupportConversation>,
    helpAddTurn: (id: string, turn: SupportConversationTurn) => ipcRenderer.invoke("help:addTurn", id, turn) as Promise<SupportConversation | null>,
    helpUpdateConversation: (
      id: string,
      patch: { status?: SupportConversationStatus; diagnosis?: string; currentState?: string; needsPermission?: boolean; actionsTaken?: string[] }
    ) => ipcRenderer.invoke("help:updateConversation", id, patch) as Promise<SupportConversation | null>,
    helpSetConversationRating: (id: string, rating: "up" | "down", detail?: string) =>
      ipcRenderer.invoke("help:setConversationRating", id, rating, detail) as Promise<SupportConversation | null>,

    onUiOpenSettings: (cb: () => void) => {
      ipcRenderer.on("ui:open-settings", () => cb());
    },

    openUpgradeInDashboard: () => ipcRenderer.send("ui:open-upgrade"),
    onUiNavigateUpgrade: (cb: () => void) => {
      ipcRenderer.on("ui:navigate-upgrade", () => cb());
    },

    overlayMoveWindow: (x: number, y: number) => ipcRenderer.invoke("overlay:moveWindow", x, y) as Promise<boolean>,
    overlayGetWindowBounds: () =>
      ipcRenderer.invoke("overlay:getWindowBounds") as Promise<{ x: number; y: number; width: number; height: number } | null>,
    overlayGetScreenWorkArea: () => ipcRenderer.invoke("overlay:getScreenWorkArea") as Promise<{ width: number; height: number }>,
    overlaySetInteractive: (active: boolean) => ipcRenderer.invoke("overlay:setInteractive", active) as Promise<boolean>,

    envGetApiKeys: () =>
      ipcRenderer.invoke("env:getApiKeys") as Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string; githubRedirectUri?: string }>,

    systemGetForegroundWindowInfo: () => ipcRenderer.invoke("system:getForegroundWindowInfo") as Promise<ForegroundWindowInfo>,
    systemGetAppVersion: () => ipcRenderer.invoke("system:getAppVersion") as Promise<string>,

    authIsGoogleSignInConfigured: () => ipcRenderer.invoke("auth:isGoogleSignInConfigured") as Promise<boolean>,
    authStartGoogleSignIn: () => ipcRenderer.invoke("auth:startGoogleSignIn") as Promise<GoogleSignInResult>,
    authIsGithubSignInConfigured: () => ipcRenderer.invoke("auth:isGithubSignInConfigured") as Promise<boolean>,
    authStartGithubSignIn: (authorizeUrl: string) =>
      ipcRenderer.invoke("auth:startGithubSignIn", authorizeUrl) as Promise<{ code: string }>,
    authIsMicrosoftSignInConfigured: () => ipcRenderer.invoke("auth:isMicrosoftSignInConfigured") as Promise<boolean>,
    authStartMicrosoftSignIn: () =>
      ipcRenderer.invoke("auth:startMicrosoftSignIn") as Promise<{ profile: any; idToken: string; accessToken: string }>,
    authSendOtp: (email: string) => ipcRenderer.invoke("auth:sendOtp", email) as Promise<{ expiresInMinutes: number }>,
    authVerifyOtp: (email: string, code: string) =>
      ipcRenderer.invoke("auth:verifyOtp", email, code) as Promise<{ valid: boolean; reason?: string }>,
    authSendPasswordResetOtp: (email: string) =>
      ipcRenderer.invoke("auth:sendPasswordResetOtp", email) as Promise<{ expiresInMinutes: number }>,
    authVerifyPasswordResetOtp: (email: string, code: string) =>
      ipcRenderer.invoke("auth:verifyPasswordResetOtp", email, code) as Promise<{ valid: boolean; reason?: string; token?: string }>,
    authValidatePasswordResetToken: (token: string) =>
      ipcRenderer.invoke("auth:validatePasswordResetToken", token) as Promise<{ valid: boolean; email?: string; reason?: string }>,

    deviceGetLocalIdentity: () => ipcRenderer.invoke("device:getLocalIdentity") as Promise<LocalDeviceIdentity>,

    notificationsSendPush: (subscription: { endpoint: string; p256dh: string; authKey: string }, payload: PushNotificationPayload) =>
      ipcRenderer.invoke("notifications:sendPush", subscription, payload) as Promise<PushSendResult>,

    billingGetPricing: () => ipcRenderer.invoke("billing:getPricing") as Promise<PricingConfig>,
    billingGetTicketPricingConfig: () => ipcRenderer.invoke("billing:getTicketPricingConfig") as Promise<TicketPricingConfig>,
    billingGetSubscription: () => ipcRenderer.invoke("billing:getSubscription") as Promise<SubscriptionState>,
    billingSetSubscriptionTier: (tier: SubscriptionTierId) =>
      ipcRenderer.invoke("billing:setSubscriptionTier", tier) as Promise<SubscriptionState>,
    billingSyncTierFromOrganization: (accessToken: string, organizationId: string, seatTier?: SeatTier) =>
      ipcRenderer.invoke("billing:syncFromOrganization", accessToken, organizationId, seatTier) as Promise<SubscriptionState>,
    billingReconcileForAccount: (accountId: string) =>
      ipcRenderer.invoke("billing:reconcileForAccount", accountId) as Promise<SubscriptionState>,
    billingResetSubscription: () => ipcRenderer.invoke("billing:resetSubscription") as Promise<SubscriptionState>,
    billingGetCreditBalance: () => ipcRenderer.invoke("billing:getCreditBalance") as Promise<CreditBalance>,
    billingConsumeCredit: (amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) =>
      ipcRenderer.invoke("billing:consumeCredit", amount, reason, category, pawModelId) as Promise<CreditBalance>,
    billingCanStartGeneration: (pawModelId?: PawModelId) =>
      ipcRenderer.invoke("billing:canStartGeneration", pawModelId) as Promise<{ allowed: boolean; reason?: string; pooled?: boolean }>,
    billingRecordTurnUsage: (submission: TurnUsageSubmission, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) =>
      ipcRenderer.invoke("billing:recordTurnUsage", submission, reason, category, pawModelId) as Promise<{ aggregated: AggregatedTurnUsage; balance: CreditBalance }>,
    billingReportUsageEvent: (
      usage: ProviderUsageMetadata,
      requestType: UsageRequestType,
      context: { sessionId: string | null; runId: string | null }
    ) => ipcRenderer.invoke("billing:reportUsageEvent", usage, requestType, context) as Promise<NormalizedUsageRecord>,
    billingGetUsageEvents: (limit?: number) => ipcRenderer.invoke("billing:getUsageEvents", limit) as Promise<NormalizedUsageRecord[]>,
    billingGetCreditHistory: () => ipcRenderer.invoke("billing:getCreditHistory") as Promise<CreditConsumptionRecord[]>,
    billingGrantComputeBonus: (units: number) => ipcRenderer.invoke("billing:grantComputeBonus", units) as Promise<EntitlementSnapshot>,

    entitlementGetSnapshot: () => ipcRenderer.invoke("entitlement:getSnapshot") as Promise<EntitlementSnapshot>,
    entitlementIsModelAvailable: (modelId: PawModelId) =>
      ipcRenderer.invoke("entitlement:isModelAvailable", modelId) as Promise<boolean>,
    entitlementIsFeatureAvailable: (featureId: FeatureId) =>
      ipcRenderer.invoke("entitlement:isFeatureAvailable", featureId) as Promise<boolean>,
    entitlementGetModelTierRequirements: () =>
      ipcRenderer.invoke("entitlement:getModelTierRequirements") as Promise<Partial<Record<PawModelId, SubscriptionTierId>>>,
    entitlementGetFeatureTierRequirements: () =>
      ipcRenderer.invoke("entitlement:getFeatureTierRequirements") as Promise<Partial<Record<FeatureId, SubscriptionTierId>>>,

    billingCreateCheckoutSession: (tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions) =>
      ipcRenderer.invoke("billing:createCheckoutSession", tier, callbackUrl, options) as Promise<BillingCheckoutResult>,
    billingGetNativePaymentMethods: (accessToken?: string) =>
      ipcRenderer.invoke("billing:getNativePaymentMethods", accessToken) as Promise<NativePaymentMethodsResult>,
    billingCreateNativeSubscriptionCheckout: (tier: SubscriptionTierId, options?: CheckoutOptions, accessToken?: string) =>
      ipcRenderer.invoke("billing:createNativeSubscriptionCheckout", tier, options, accessToken) as Promise<NativeSubscriptionCheckoutResult>,
    billingConfirmNativeSubscriptionPayment: (paymentId: string, subscriptionId: string, signature: string, accessToken?: string) =>
      ipcRenderer.invoke("billing:confirmNativeSubscriptionPayment", paymentId, subscriptionId, signature, accessToken) as Promise<
        { ok: true; subscription: SubscriptionState } | { ok: false; reason: string }
      >,
    billingStartCheckoutSync: () => ipcRenderer.invoke("billing:startCheckoutSync") as Promise<string>,
    billingCreateCreditsCheckoutSession: (amountUsd: number, organizationId?: string, callbackUrl?: string, accessToken?: string) =>
      ipcRenderer.invoke("billing:createCreditsCheckoutSession", amountUsd, organizationId, callbackUrl, accessToken) as Promise<BillingCheckoutResult>,
    billingCreateNativeCreditsCheckout: (amountUsd: number, organizationId?: string, accessToken?: string) =>
      ipcRenderer.invoke("billing:createNativeCreditsCheckout", amountUsd, organizationId, accessToken) as Promise<NativeCreditsCheckoutResult>,
    billingVerifyNativeCreditsPayment: (params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }) =>
      ipcRenderer.invoke("billing:verifyNativeCreditsPayment", params) as Promise<NativeCreditsVerificationResult>,
    billingCreateNativeUsageCreditsCheckout: (amountUsd: number, organizationId?: string, accessToken?: string) =>
      ipcRenderer.invoke("billing:createNativeUsageCreditsCheckout", amountUsd, organizationId, accessToken) as Promise<NativeCreditsCheckoutResult>,
    billingVerifyNativeUsageCreditsPayment: (params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }) =>
      ipcRenderer.invoke("billing:verifyNativeUsageCreditsPayment", params) as Promise<NativeCreditsVerificationResult>,
    billingCreateHighValueInvoices: (params: { plan: string; seatTier?: string; seatCount: number; customerName: string; organizationName: string; gstNumber?: string; accessToken?: string }) =>
      ipcRenderer.invoke("billing:createHighValueInvoices", params) as Promise<{ ok: boolean; reason?: string; plan?: string; seatTier?: string | null; seatCount?: number; monthlyAmountUsd?: number; monthlyAmountInr?: number; invoiceCount?: number; invoices?: Array<{ number: number; amountInr: number; amountUsd: number; invoiceId: string; invoiceUrl: string }>; customerName?: string; organizationName?: string; gstNumber?: string | null; keyId?: string }>,
    onSubscriptionUpdated: (cb: () => void) => {
      ipcRenderer.on("billing:subscriptionUpdated", () => cb());
    },
    onTaskCreditsPurchased: (cb: (payload: { amountUsd?: number; organizationId?: string }) => void) => {
      ipcRenderer.on("billing:taskCreditsPurchased", (_evt, payload) => cb(payload));
    },

    onboardingGet: () => ipcRenderer.invoke("onboarding:get") as Promise<OnboardingState>,
    onboardingSetStep: (step: number) => ipcRenderer.invoke("onboarding:setStep", step) as Promise<OnboardingState>,
    onboardingComplete: () => ipcRenderer.invoke("onboarding:complete") as Promise<OnboardingState>,
    onboardingSelectWorkspaceFolder: () =>
      ipcRenderer.invoke("onboarding:selectWorkspaceFolder") as Promise<OnboardingState>,

    companionPickUploadFile: () => ipcRenderer.invoke("companion:pickUploadFile") as Promise<string | null>,
    // webUtils.getPathForFile runs directly in preload (no IPC round-trip needed) — it recovers the
    // real filesystem path of a File dropped via HTML5 drag-and-drop, which browser File objects no
    // longer expose directly as of Electron 32+.
    companionGetPathForFile: (file: File) => webUtils.getPathForFile(file) as string,
    companionShowNotification: (title: string, body: string) =>
      ipcRenderer.invoke("companion:showNotification", title, body) as Promise<boolean>,
    companionExportPackage: (input: CompanionPackageInput, suggestedName: string) =>
      ipcRenderer.invoke("companion:exportPackage", input, suggestedName) as Promise<string | null>,
    companionImportPackage: () => ipcRenderer.invoke("companion:importPackage") as Promise<ImportedCompanionPackage | null>,

    mailSend: (method: string, to: string, params: unknown) =>
      ipcRenderer.invoke("mail:send", method, to, params) as Promise<boolean>,
    mailListTemplates: () => ipcRenderer.invoke("mail:listTemplates") as Promise<{ key: string; label: string }[]>,
    mailRenderPreview: (key: string) => ipcRenderer.invoke("mail:renderPreview", key) as Promise<string>,

    sessionsList: () => ipcRenderer.invoke("sessions:list") as Promise<ConversationSessionSummary[]>,
    sessionsGet: (id: string) => ipcRenderer.invoke("sessions:get", id) as Promise<ConversationSession | undefined>,
    sessionsSearch: (query: string) => ipcRenderer.invoke("sessions:search", query) as Promise<ConversationSessionSummary[]>,
    sessionsAppendTurn: (turn: ConversationSessionTurn, hint?: SessionContinuationHint) =>
      ipcRenderer.invoke("sessions:appendTurn", turn, hint) as Promise<ConversationSession>,
    sessionsRename: (id: string, title: string) =>
      ipcRenderer.invoke("sessions:rename", id, title) as Promise<ConversationSession | undefined>,
    sessionsSetPinned: (id: string, pinned: boolean) =>
      ipcRenderer.invoke("sessions:setPinned", id, pinned) as Promise<ConversationSession | undefined>,
    sessionsSetArchived: (id: string, archived: boolean) =>
      ipcRenderer.invoke("sessions:setArchived", id, archived) as Promise<ConversationSession | undefined>,
    sessionsDelete: (id: string) => ipcRenderer.invoke("sessions:delete", id) as Promise<boolean>,
    sessionsExport: (id: string) => ipcRenderer.invoke("sessions:export", id) as Promise<string | undefined>,
    onSessionsUpdated: (cb: () => void) => {
      ipcRenderer.on("sessions:updated", () => cb());
    },

    executionRecord: (record: ExecutionRecord) => ipcRenderer.invoke("execution:record", record) as Promise<void>,
    executionList: () => ipcRenderer.invoke("execution:list") as Promise<ExecutionRecord[]>,
    onExecutionUpdated: (cb: () => void) => {
      ipcRenderer.on("execution:updated", () => cb());
    },

    browserGetCapabilities: () => ipcRenderer.invoke("browser:getCapabilities") as Promise<BrowserCapabilityReport[]>,

    onProcessOutput: (cb: (event: ProcessOutputEvent) => void) => {
      ipcRenderer.on("process:output", (_: any, payload: ProcessOutputEvent) => cb(payload));
    },
    onProcessExit: (cb: (event: ProcessExitEvent) => void) => {
      ipcRenderer.on("process:exit", (_: any, payload: ProcessExitEvent) => cb(payload));
    },
    onWorkspaceFileChanged: (cb: (event: WorkspaceFileChangeEvent) => void) => {
      ipcRenderer.on("workspace:fileChanged", (_: any, payload: WorkspaceFileChangeEvent) => cb(payload));
    },
    onWorkspaceObservation: (cb: (event: WorkspaceObservationEvent) => void) => {
      ipcRenderer.on("workspace:observation", (_: any, payload: WorkspaceObservationEvent) => cb(payload));
    },

    communicationSaveAudio: (communicationId: string, base64Data: string, mimeType: string) =>
      ipcRenderer.invoke("communication:saveAudio", communicationId, base64Data, mimeType) as Promise<{ ok: boolean; data?: { audioPath: string }; message?: string }>,
    communicationAppendRecordingChunk: (communicationId: string, kind: "audio" | "video", base64Chunk: string, expectedChecksum?: string) =>
      ipcRenderer.invoke("communication:appendRecordingChunk", communicationId, kind, base64Chunk, expectedChecksum) as Promise<{ ok: boolean; message?: string }>,
    communicationFinalizeRecording: (communicationId: string, kind: "audio" | "video", mimeType: string) =>
      ipcRenderer.invoke("communication:finalizeRecording", communicationId, kind, mimeType) as Promise<{ ok: boolean; data?: { path: string; sizeBytes: number; checksum: string } | null; message?: string }>,
    communicationGetRecordingDiagnostics: (communicationId: string) =>
      ipcRenderer.invoke("communication:getRecordingDiagnostics", communicationId) as Promise<Record<string, unknown> | null>,
    communicationDeleteRecording: (communicationId: string) =>
      ipcRenderer.invoke("communication:deleteRecording", communicationId) as Promise<{ ok: boolean; message?: string }>,
    communicationGetRecordingTimeline: (communicationId: string) =>
      ipcRenderer.invoke("communication:getRecordingTimeline", communicationId) as Promise<RecordingTimelineEntry[]>,
    communicationGenerateEvidence: (communicationId: string, apiKey: string, model?: string, baseUrl?: string) =>
      ipcRenderer.invoke("communication:generateEvidence", communicationId, apiKey, model, baseUrl) as Promise<{ ok: boolean; data?: { evidenceCount: number }; message?: string }>,
    communicationGetEvidence: (communicationId: string) =>
      ipcRenderer.invoke("communication:getEvidence", communicationId) as Promise<EvidenceObject[]>,
    communicationGenerateBusinessInsights: (communicationId: string, apiKey: string, model?: string, baseUrl?: string) =>
      ipcRenderer.invoke("communication:generateBusinessInsights", communicationId, apiKey, model, baseUrl) as Promise<{ ok: boolean; data?: { insightCount: number }; message?: string }>,
    communicationGetBusinessInsights: (communicationId: string) =>
      ipcRenderer.invoke("communication:getBusinessInsights", communicationId) as Promise<BusinessInsight[]>,
    onCommunicationEvent: (cb: (event: CommunicationRuntimeEvent) => void) => {
      ipcRenderer.on("communication:event", (_: any, payload: CommunicationRuntimeEvent) => cb(payload));
    },
    communicationListLocalParticipants: () => ipcRenderer.invoke("communication:listLocalParticipants") as Promise<ParticipantRecord[]>,
    communicationListLocalCompanies: () => ipcRenderer.invoke("communication:listLocalCompanies") as Promise<CompanyRecord[]>,
    communicationListLocalSummaries: () => ipcRenderer.invoke("communication:listLocalSummaries") as Promise<CommunicationSummary[]>,
    communicationListLocalFollowUps: () => ipcRenderer.invoke("communication:listLocalFollowUps") as Promise<FollowUp[]>,

    // Connectivity Runtime — every channel resolves a ConnectivityIpcResult<T>
    // envelope (see connectivityIpc.ts); this bridge never unwraps it, the
    // renderer decides how to handle { ok: false, error }.
    connectivityListConnectors: () =>
      ipcRenderer.invoke("connectivity:listConnectors") as Promise<ConnectivityIpcResult<ConnectorDefinition[]>>,
    connectivityListConnections: (scope: ConnectivityScope) =>
      ipcRenderer.invoke("connectivity:listConnections", scope) as Promise<ConnectivityIpcResult<ConnectorConnection[]>>,
    connectivityConnect: (connectorId: string, scope: ConnectivityScope) =>
      ipcRenderer.invoke("connectivity:connect", connectorId, scope) as Promise<ConnectivityIpcResult<ConnectorConnection>>,
    connectivityGetStatus: (connectorId: string, scope: ConnectivityScope) =>
      ipcRenderer.invoke("connectivity:getStatus", connectorId, scope) as Promise<ConnectivityIpcResult<ConnectorStatus>>,
    connectivityRestore: (connectorId: string, scope: ConnectivityScope, credential: unknown) =>
      ipcRenderer.invoke("connectivity:restore", connectorId, scope, credential) as Promise<ConnectivityIpcResult<ConnectorStatus>>,
    connectivityDisconnect: (connectionId: string) =>
      ipcRenderer.invoke("connectivity:disconnect", connectionId) as Promise<ConnectivityIpcResult<void>>,
    connectivityCheckHealth: (connectionId: string) =>
      ipcRenderer.invoke("connectivity:checkHealth", connectionId) as Promise<ConnectivityIpcResult<ConnectorConnection>>,
    connectivityRefreshDiscovery: () =>
      ipcRenderer.invoke("connectivity:refreshDiscovery") as Promise<ConnectivityIpcResult<void>>,
    connectivityVerifyPullRequestExists: (prUrl: string) =>
      ipcRenderer.invoke("connectivity:verifyPullRequestExists", prUrl) as Promise<ConnectivityIpcResult<{ verified: boolean; reason: string }>>,
    connectivityPostAutonomousCompletionComment: (prUrl: string, body: string) =>
      ipcRenderer.invoke("connectivity:postAutonomousCompletionComment", prUrl, body) as Promise<ConnectivityIpcResult<{ posted: boolean; reason: string; commentUrl?: string }>>,
    connectivityDeploymentProfilesCreate: (scope: ConnectivityScope, name: string, config: DeploymentProfileConfig) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:create", scope, name, config) as Promise<ConnectivityIpcResult<DeploymentProfile>>,
    connectivityDeploymentProfilesGet: (profileId: string) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:get", profileId) as Promise<ConnectivityIpcResult<DeploymentProfile | undefined>>,
    connectivityDeploymentProfilesList: (scope: ConnectivityScope) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:list", scope) as Promise<ConnectivityIpcResult<DeploymentProfile[]>>,
    connectivityDeploymentProfilesUpdate: (profileId: string, patch: Partial<Pick<DeploymentProfile, "name" | "config" | "isDefault">>) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:update", profileId, patch) as Promise<ConnectivityIpcResult<DeploymentProfile>>,
    connectivityDeploymentProfilesRemove: (profileId: string) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:remove", profileId) as Promise<ConnectivityIpcResult<void>>,
    connectivityApiTokensValidate: (connectorId: string, token: string) =>
      ipcRenderer.invoke("connectivity:apiTokens:validate", connectorId, token) as Promise<ConnectivityIpcResult<ApiTokenValidationResult>>,
    connectivityApiTokensSave: (connectorId: string, scope: ConnectivityScope, token: string) =>
      ipcRenderer.invoke("connectivity:apiTokens:save", connectorId, scope, token) as Promise<ConnectivityIpcResult<void>>,
    connectivityOAuthBegin: (connectorId: string, scope: ConnectivityScope) =>
      ipcRenderer.invoke("connectivity:oauth:begin", connectorId, scope) as Promise<ConnectivityIpcResult<OAuthBeginResult>>,
    connectivityOAuthCancel: (requestId: string) =>
      ipcRenderer.invoke("connectivity:oauth:cancel", requestId) as Promise<ConnectivityIpcResult<void>>,
    connectivityDeploymentProfilesHydrate: (profile: DeploymentProfile) =>
      ipcRenderer.invoke("connectivity:deploymentProfiles:hydrate", profile) as Promise<ConnectivityIpcResult<void>>,
  };

  electronContextBridge.exposeInMainWorld("__pawos_ipc__", api);
}
