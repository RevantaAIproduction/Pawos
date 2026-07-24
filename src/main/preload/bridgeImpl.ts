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
import type { CommunicationRuntimeEvent, ParticipantRecord, CompanyRecord, CommunicationSummary, FollowUp } from "../../shared/communication/CommunicationTypes";
import type { ForegroundWindowInfo } from "../../shared/system/ForegroundWindowInfo";
import type { GoogleSignInResult } from "../../shared/auth/AccountTypes";
import type { PairedDevice } from "../../shared/pairing/PairingTypes";
import type { LocalDeviceIdentity } from "../../shared/device/DeviceTypes";
import type {
  PricingConfig,
  SubscriptionState,
  SubscriptionTierId,
  CreditBalance,
  BillingCheckoutResult,
  CheckoutOptions,
  FeatureId,
  EntitlementSnapshot,
} from "../../shared/billing/BillingTypes";
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

    overlayMoveWindow: (x: number, y: number) => ipcRenderer.invoke("overlay:moveWindow", x, y) as Promise<boolean>,
    overlayGetWindowBounds: () =>
      ipcRenderer.invoke("overlay:getWindowBounds") as Promise<{ x: number; y: number; width: number; height: number } | null>,
    overlayGetScreenWorkArea: () => ipcRenderer.invoke("overlay:getScreenWorkArea") as Promise<{ width: number; height: number }>,
    overlaySetInteractive: (active: boolean) => ipcRenderer.invoke("overlay:setInteractive", active) as Promise<boolean>,

    envGetApiKeys: () =>
      ipcRenderer.invoke("env:getApiKeys") as Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string }>,

    systemGetForegroundWindowInfo: () => ipcRenderer.invoke("system:getForegroundWindowInfo") as Promise<ForegroundWindowInfo>,
    systemGetAppVersion: () => ipcRenderer.invoke("system:getAppVersion") as Promise<string>,

    authIsGoogleSignInConfigured: () => ipcRenderer.invoke("auth:isGoogleSignInConfigured") as Promise<boolean>,
    authStartGoogleSignIn: () => ipcRenderer.invoke("auth:startGoogleSignIn") as Promise<GoogleSignInResult>,
    authSendOtp: (email: string) => ipcRenderer.invoke("auth:sendOtp", email) as Promise<{ expiresInMinutes: number }>,
    authVerifyOtp: (email: string, code: string) =>
      ipcRenderer.invoke("auth:verifyOtp", email, code) as Promise<{ valid: boolean; reason?: string }>,
    authSendPasswordResetOtp: (email: string) =>
      ipcRenderer.invoke("auth:sendPasswordResetOtp", email) as Promise<{ expiresInMinutes: number }>,
    authVerifyPasswordResetOtp: (email: string, code: string) =>
      ipcRenderer.invoke("auth:verifyPasswordResetOtp", email, code) as Promise<{ valid: boolean; reason?: string; token?: string }>,
    authValidatePasswordResetToken: (token: string) =>
      ipcRenderer.invoke("auth:validatePasswordResetToken", token) as Promise<{ valid: boolean; email?: string; reason?: string }>,

    pairingBegin: (userId?: string) =>
      ipcRenderer.invoke("pairing:begin", userId) as Promise<{ token: string; pairingUri: string; qrDataUrl: string; expiresAt: number }>,
    pairingComplete: (token: string, deviceName: string, publicKey: string) =>
      ipcRenderer.invoke("pairing:complete", token, deviceName, publicKey) as Promise<
        { ok: true; device: PairedDevice } | { ok: false; reason: string }
      >,
    pairingList: (userId?: string) => ipcRenderer.invoke("pairing:list", userId) as Promise<PairedDevice[]>,
    pairingRevoke: (deviceId: string) => ipcRenderer.invoke("pairing:revoke", deviceId) as Promise<boolean>,

    deviceGetLocalIdentity: () => ipcRenderer.invoke("device:getLocalIdentity") as Promise<LocalDeviceIdentity>,

    billingGetPricing: () => ipcRenderer.invoke("billing:getPricing") as Promise<PricingConfig>,
    billingGetSubscription: () => ipcRenderer.invoke("billing:getSubscription") as Promise<SubscriptionState>,
    billingSetSubscriptionTier: (tier: SubscriptionTierId) =>
      ipcRenderer.invoke("billing:setSubscriptionTier", tier) as Promise<SubscriptionState>,
    billingSyncTierFromOrganization: (orgTier: SubscriptionTierId) =>
      ipcRenderer.invoke("billing:syncFromOrganization", orgTier) as Promise<SubscriptionState>,
    billingGetCreditBalance: () => ipcRenderer.invoke("billing:getCreditBalance") as Promise<CreditBalance>,
    billingConsumeCredit: (amount: number, reason: string) =>
      ipcRenderer.invoke("billing:consumeCredit", amount, reason) as Promise<CreditBalance>,

    entitlementGetSnapshot: () => ipcRenderer.invoke("entitlement:getSnapshot") as Promise<EntitlementSnapshot>,
    entitlementIsModelAvailable: (modelId: PawModelId) =>
      ipcRenderer.invoke("entitlement:isModelAvailable", modelId) as Promise<boolean>,
    entitlementIsFeatureAvailable: (featureId: FeatureId) =>
      ipcRenderer.invoke("entitlement:isFeatureAvailable", featureId) as Promise<boolean>,

    billingCreateCheckoutSession: (tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions) =>
      ipcRenderer.invoke("billing:createCheckoutSession", tier, callbackUrl, options) as Promise<BillingCheckoutResult>,
    billingStartCheckoutSync: () => ipcRenderer.invoke("billing:startCheckoutSync") as Promise<string>,
    billingCreateCreditsCheckoutSession: (credits: number, organizationId?: string, callbackUrl?: string) =>
      ipcRenderer.invoke("billing:createCreditsCheckoutSession", credits, organizationId, callbackUrl) as Promise<BillingCheckoutResult>,
    onSubscriptionUpdated: (cb: () => void) => {
      ipcRenderer.on("billing:subscriptionUpdated", () => cb());
    },
    onTaskCreditsPurchased: (cb: (payload: { credits: number; organizationId?: string }) => void) => {
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
    onCommunicationEvent: (cb: (event: CommunicationRuntimeEvent) => void) => {
      ipcRenderer.on("communication:event", (_: any, payload: CommunicationRuntimeEvent) => cb(payload));
    },
    communicationListLocalParticipants: () => ipcRenderer.invoke("communication:listLocalParticipants") as Promise<ParticipantRecord[]>,
    communicationListLocalCompanies: () => ipcRenderer.invoke("communication:listLocalCompanies") as Promise<CompanyRecord[]>,
    communicationListLocalSummaries: () => ipcRenderer.invoke("communication:listLocalSummaries") as Promise<CommunicationSummary[]>,
    communicationListLocalFollowUps: () => ipcRenderer.invoke("communication:listLocalFollowUps") as Promise<FollowUp[]>,
  };

  electronContextBridge.exposeInMainWorld("__pawos_ipc__", api);
}

