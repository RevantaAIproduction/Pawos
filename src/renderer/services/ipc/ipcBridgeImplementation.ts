import type {
  SettingsState,
  FeedbackSubmission,
  SupportConversationTurn,
  SupportConversationStatus,
} from './ipcTypes';
import { getIpcBridge } from './ipcBridge';
import type { CompanionCommand } from '../../../shared/companion/CompanionCommand';
import type { CompanionPackageInput, ImportedCompanionPackage } from '../../../shared/companion/CompanionPackageTypes';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ForegroundWindowInfo } from '../../../shared/system/ForegroundWindowInfo';
import type { GoogleSignInResult } from '../../../shared/auth/AccountTypes';
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
import type { LocalDeviceIdentity } from '../../../shared/device/DeviceTypes';
import type { PushNotificationPayload, PushSendResult } from '../../../shared/mobilePresence/MobilePresenceTypes';
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
import type {
  PricingConfig,
  TicketPricingConfig,
  SubscriptionState,
  SubscriptionTierId,
  CreditBalance,
  CreditConsumptionRecord,
  BillingCheckoutResult,
  NativeSubscriptionCheckoutResult,
  NativeCreditsCheckoutResult,
  NativeCreditsVerificationResult,
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
import type { OrganizationUsageRecordRequest, OrganizationUsageRecordResponse } from '../../../shared/billing/OrganizationUsageBridgeTypes';
import type { PawModelId } from '../../../shared/ai/PawModelTypes';
import type { OnboardingState } from '../../../shared/onboarding/OnboardingTypes';

// Lazy initialization - access the bridge only when first needed
let _bridge: ReturnType<typeof getIpcBridge> | undefined;

function getBridge() {
  if (!_bridge) {
    _bridge = getIpcBridge();
    if (!_bridge) {
      throw new Error('IPC bridge not initialized. Preload may not have loaded.');
    }
  }
  return _bridge;
}

export const ipc = {
  async actionExecute(request: ActionRequest): Promise<ActionResult> {
    return getBridge().actionExecute(request);
  },
  onOrganizationUsageRecordRequest(cb: (request: OrganizationUsageRecordRequest) => void): () => void {
    return getBridge().onOrganizationUsageRecordRequest(cb);
  },
  async organizationUsageRecordRespond(requestId: string, response: OrganizationUsageRecordResponse): Promise<void> {
    return getBridge().organizationUsageRecordRespond(requestId, response);
  },
  async processWriteStdin(processId: string, data: string): Promise<{ ok: true } | { ok: false; message: string }> {
    return getBridge().processWriteStdin(processId, data);
  },
  async systemGetHomeDir(): Promise<string> {
    return getBridge().systemGetHomeDir();
  },
  async remoteAssistanceStartSharedTerminal(
    cwd: string,
    label: string
  ): Promise<{ ok: true; info: { id: string; pid: number | null } } | { ok: false; message: string }> {
    return getBridge().remoteAssistanceStartSharedTerminal(cwd, label);
  },
  async actionCheckRequirements(request: ActionRequest): Promise<ActionRequirement[]> {
    return getBridge().actionCheckRequirements(request);
  },
  async actionDescribe(request: ActionRequest): Promise<string> {
    return getBridge().actionDescribe(request);
  },
  async actionReportResult(request: ActionRequest, result: ActionResult): Promise<string> {
    return getBridge().actionReportResult(request, result);
  },
  async assetsGetAnimationsBaseUrl(): Promise<string> {
    return getBridge().assetsGetAnimationsBaseUrl();
  },
  async assetsGetCharactersBaseUrl(): Promise<string> {
    return getBridge().assetsGetCharactersBaseUrl();
  },
  async companionEnable(): Promise<boolean> {
    return getBridge().companionEnable();
  },
  async companionDisable(): Promise<boolean> {
    return getBridge().companionDisable();
  },
  async companionIsEnabled(): Promise<boolean> {
    return getBridge().companionIsEnabled();
  },
  async companionSendCommand(command: CompanionCommand): Promise<boolean> {
    return getBridge().companionSendCommand(command);
  },
  onCompanionCommand(cb: (command: CompanionCommand) => void) {
    getBridge().onCompanionCommand(cb);
  },
  companionNotifyReady() {
    getBridge().companionNotifyReady();
  },
  onCompanionReady(cb: () => void) {
    getBridge().onCompanionReady(cb);
  },
  async settingsGet(): Promise<SettingsState> {
    return getBridge().settingsGet();
  },
  async settingsSet(partial: Partial<SettingsState>) {
    return getBridge().settingsSet(partial);
  },
  async petsList() {
    return getBridge().petsList();
  },
  async petsLoad(petId: string) {
    return getBridge().petsLoad(petId);
  },
  onSettingsUpdated(cb: (s: SettingsState) => void) {
    getBridge().onSettingsUpdated(cb);
  },
  onUiOpenSettings(cb: () => void) {
    getBridge().onUiOpenSettings(cb);
  },
  openUpgradeInDashboard() {
    getBridge().openUpgradeInDashboard();
  },
  onUiNavigateUpgrade(cb: () => void) {
    getBridge().onUiNavigateUpgrade(cb);
  },
  async feedbackSubmit(submission: FeedbackSubmission): Promise<boolean> {
    return getBridge().feedbackSubmit(submission);
  },
  async feedbackDismiss(opts: { dontAskAgain: boolean }): Promise<boolean> {
    return getBridge().feedbackDismiss(opts);
  },
  onShowRatingPrompt(cb: () => void) {
    getBridge().onShowRatingPrompt(cb);
  },
  async mailSendOrganizationInvite(params: { to: string; organizationName: string; role: string; inviterName: string }): Promise<boolean> {
    return getBridge().mailSendOrganizationInvite(params);
  },
  async helpGetActivity() {
    return getBridge().helpGetActivity();
  },
  async helpRecordArticleView(articleId: string) {
    return getBridge().helpRecordArticleView(articleId);
  },
  async helpListConversations() {
    return getBridge().helpListConversations();
  },
  async helpGetConversation(id: string) {
    return getBridge().helpGetConversation(id);
  },
  async helpCreateConversation(problemSummary: string) {
    return getBridge().helpCreateConversation(problemSummary);
  },
  async helpAddTurn(id: string, turn: SupportConversationTurn) {
    return getBridge().helpAddTurn(id, turn);
  },
  async helpUpdateConversation(
    id: string,
    patch: {
      status?: SupportConversationStatus;
      diagnosis?: string;
      currentState?: string;
      needsPermission?: boolean;
      actionsTaken?: string[];
    }
  ) {
    return getBridge().helpUpdateConversation(id, patch);
  },
  async helpSetConversationRating(id: string, rating: 'up' | 'down', detail?: string) {
    return getBridge().helpSetConversationRating(id, rating, detail);
  },
  async overlayMoveWindow(x: number, y: number): Promise<boolean> {
    return getBridge().overlayMoveWindow(x, y);
  },
  async overlayGetWindowBounds(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return getBridge().overlayGetWindowBounds();
  },
  async overlayGetScreenWorkArea(): Promise<{ width: number; height: number }> {
    return getBridge().overlayGetScreenWorkArea();
  },
  async overlaySetInteractive(active: boolean): Promise<boolean> {
    return getBridge().overlaySetInteractive(active);
  },
  async envGetApiKeys(): Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string; githubRedirectUri?: string }> {
    return getBridge().envGetApiKeys();
  },
  async systemGetAppVersion(): Promise<string> {
    return getBridge().systemGetAppVersion();
  },
  async systemGetForegroundWindowInfo(): Promise<ForegroundWindowInfo> {
    return getBridge().systemGetForegroundWindowInfo();
  },
  async authIsGoogleSignInConfigured(): Promise<boolean> {
    return getBridge().authIsGoogleSignInConfigured();
  },
  async authStartGoogleSignIn(): Promise<GoogleSignInResult> {
    return getBridge().authStartGoogleSignIn();
  },
  async authIsGithubSignInConfigured(): Promise<boolean> {
    return getBridge().authIsGithubSignInConfigured();
  },
  async authStartGithubSignIn(authorizeUrl: string): Promise<{ code: string }> {
    return getBridge().authStartGithubSignIn(authorizeUrl);
  },
  async authSendOtp(email: string): Promise<{ expiresInMinutes: number }> {
    return getBridge().authSendOtp(email);
  },
  async authVerifyOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
    return getBridge().authVerifyOtp(email, code);
  },
  async authSendPasswordResetOtp(email: string): Promise<{ expiresInMinutes: number }> {
    return getBridge().authSendPasswordResetOtp(email);
  },
  async authVerifyPasswordResetOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string; token?: string }> {
    return getBridge().authVerifyPasswordResetOtp(email, code);
  },
  async authValidatePasswordResetToken(token: string): Promise<{ valid: boolean; email?: string; reason?: string }> {
    return getBridge().authValidatePasswordResetToken(token);
  },
  async deviceGetLocalIdentity(): Promise<LocalDeviceIdentity> {
    return getBridge().deviceGetLocalIdentity();
  },
  async notificationsSendPush(
    subscription: { endpoint: string; p256dh: string; authKey: string },
    payload: PushNotificationPayload
  ): Promise<PushSendResult> {
    return getBridge().notificationsSendPush(subscription, payload);
  },
  async billingGetPricing(): Promise<PricingConfig> {
    return getBridge().billingGetPricing();
  },
  async billingGetTicketPricingConfig(): Promise<TicketPricingConfig> {
    return getBridge().billingGetTicketPricingConfig();
  },
  async billingGetSubscription(): Promise<SubscriptionState> {
    return getBridge().billingGetSubscription();
  },
  async billingSetSubscriptionTier(tier: SubscriptionTierId): Promise<SubscriptionState> {
    return getBridge().billingSetSubscriptionTier(tier);
  },
  async billingSyncTierFromOrganization(accessToken: string, organizationId: string, seatTier?: SeatTier): Promise<SubscriptionState> {
    return getBridge().billingSyncTierFromOrganization(accessToken, organizationId, seatTier);
  },
  async billingReconcileForAccount(accountId: string): Promise<SubscriptionState> {
    return getBridge().billingReconcileForAccount(accountId);
  },
  async billingResetSubscription(): Promise<SubscriptionState> {
    return getBridge().billingResetSubscription();
  },
  async billingGetCreditBalance(): Promise<CreditBalance> {
    return getBridge().billingGetCreditBalance();
  },
  async billingCanStartGeneration(pawModelId?: PawModelId): Promise<{ allowed: boolean; reason?: string; pooled?: boolean }> {
    return getBridge().billingCanStartGeneration(pawModelId);
  },
  async billingConsumeCredit(amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId): Promise<CreditBalance> {
    return getBridge().billingConsumeCredit(amount, reason, category, pawModelId);
  },
  async billingRecordTurnUsage(
    submission: TurnUsageSubmission,
    reason: string,
    category?: AiUsageCategory,
    pawModelId?: PawModelId
  ): Promise<{ aggregated: AggregatedTurnUsage; balance: CreditBalance }> {
    return getBridge().billingRecordTurnUsage(submission, reason, category, pawModelId);
  },
  async billingReportUsageEvent(
    usage: ProviderUsageMetadata,
    requestType: UsageRequestType,
    context: { sessionId: string | null; runId: string | null }
  ): Promise<NormalizedUsageRecord> {
    return getBridge().billingReportUsageEvent(usage, requestType, context);
  },
  async billingGetUsageEvents(limit?: number): Promise<NormalizedUsageRecord[]> {
    return getBridge().billingGetUsageEvents(limit);
  },
  async billingGetCreditHistory(): Promise<CreditConsumptionRecord[]> {
    return getBridge().billingGetCreditHistory();
  },
  async billingGrantComputeBonus(units: number): Promise<EntitlementSnapshot> {
    return getBridge().billingGrantComputeBonus(units);
  },
  async entitlementGetSnapshot(): Promise<EntitlementSnapshot> {
    return getBridge().entitlementGetSnapshot();
  },
  async entitlementIsModelAvailable(modelId: PawModelId): Promise<boolean> {
    return getBridge().entitlementIsModelAvailable(modelId);
  },
  async entitlementIsFeatureAvailable(featureId: FeatureId): Promise<boolean> {
    return getBridge().entitlementIsFeatureAvailable(featureId);
  },
  async entitlementGetModelTierRequirements(): Promise<Partial<Record<PawModelId, SubscriptionTierId>>> {
    return getBridge().entitlementGetModelTierRequirements();
  },
  async entitlementGetFeatureTierRequirements(): Promise<Partial<Record<FeatureId, SubscriptionTierId>>> {
    return getBridge().entitlementGetFeatureTierRequirements();
  },
  async billingCreateCheckoutSession(tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions): Promise<BillingCheckoutResult> {
    return getBridge().billingCreateCheckoutSession(tier, callbackUrl, options);
  },
  async billingCreateNativeSubscriptionCheckout(tier: SubscriptionTierId, options?: CheckoutOptions): Promise<NativeSubscriptionCheckoutResult> {
    return getBridge().billingCreateNativeSubscriptionCheckout(tier, options);
  },
  async billingConfirmNativeSubscriptionPayment(paymentId: string, subscriptionId: string, signature: string): Promise<{ ok: true; subscription: SubscriptionState } | { ok: false; reason: string }> {
    return getBridge().billingConfirmNativeSubscriptionPayment(paymentId, subscriptionId, signature);
  },
  async billingStartCheckoutSync(): Promise<string> {
    return getBridge().billingStartCheckoutSync();
  },
  async billingCreateCreditsCheckoutSession(amountUsd: number, organizationId?: string, callbackUrl?: string, accessToken?: string): Promise<BillingCheckoutResult> {
    return getBridge().billingCreateCreditsCheckoutSession(amountUsd, organizationId, callbackUrl, accessToken);
  },
  async billingCreateNativeCreditsCheckout(amountUsd: number, organizationId?: string, accessToken?: string): Promise<NativeCreditsCheckoutResult> {
    return getBridge().billingCreateNativeCreditsCheckout(amountUsd, organizationId, accessToken);
  },
  async billingVerifyNativeCreditsPayment(params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }): Promise<NativeCreditsVerificationResult> {
    return getBridge().billingVerifyNativeCreditsPayment(params);
  },
  onSubscriptionUpdated(cb: () => void) {
    return getBridge().onSubscriptionUpdated(cb);
  },
  onTaskCreditsPurchased(cb: (payload: { amountUsd?: number; organizationId?: string }) => void) {
    return getBridge().onTaskCreditsPurchased(cb);
  },
  async onboardingGet(): Promise<OnboardingState> {
    return getBridge().onboardingGet();
  },
  async onboardingSetStep(step: number): Promise<OnboardingState> {
    return getBridge().onboardingSetStep(step);
  },
  async onboardingComplete(): Promise<OnboardingState> {
    return getBridge().onboardingComplete();
  },
  async onboardingSelectWorkspaceFolder(): Promise<OnboardingState> {
    return getBridge().onboardingSelectWorkspaceFolder();
  },
  async companionPickUploadFile(): Promise<string | null> {
    return getBridge().companionPickUploadFile();
  },
  companionGetPathForFile(file: File): string {
    return getBridge().companionGetPathForFile(file);
  },
  async companionShowNotification(title: string, body: string): Promise<boolean> {
    return getBridge().companionShowNotification(title, body);
  },
  async companionExportPackage(input: CompanionPackageInput, suggestedName: string): Promise<string | null> {
    return getBridge().companionExportPackage(input, suggestedName);
  },
  async companionImportPackage(): Promise<ImportedCompanionPackage | null> {
    return getBridge().companionImportPackage();
  },
  async mailSend(method: string, to: string, params: unknown): Promise<boolean> {
    return getBridge().mailSend(method, to, params);
  },
  async mailListTemplates(): Promise<{ key: string; label: string }[]> {
    return getBridge().mailListTemplates();
  },
  async mailRenderPreview(key: string): Promise<string> {
    return getBridge().mailRenderPreview(key);
  },
  async sessionsList(): Promise<ConversationSessionSummary[]> {
    return getBridge().sessionsList();
  },
  async sessionsGet(id: string): Promise<ConversationSession | undefined> {
    return getBridge().sessionsGet(id);
  },
  async sessionsSearch(query: string): Promise<ConversationSessionSummary[]> {
    return getBridge().sessionsSearch(query);
  },
  async sessionsAppendTurn(turn: ConversationSessionTurn, hint?: SessionContinuationHint): Promise<ConversationSession> {
    return getBridge().sessionsAppendTurn(turn, hint);
  },
  async sessionsRename(id: string, title: string): Promise<ConversationSession | undefined> {
    return getBridge().sessionsRename(id, title);
  },
  async sessionsSetPinned(id: string, pinned: boolean): Promise<ConversationSession | undefined> {
    return getBridge().sessionsSetPinned(id, pinned);
  },
  async sessionsSetArchived(id: string, archived: boolean): Promise<ConversationSession | undefined> {
    return getBridge().sessionsSetArchived(id, archived);
  },
  async sessionsDelete(id: string): Promise<boolean> {
    return getBridge().sessionsDelete(id);
  },
  async sessionsExport(id: string): Promise<string | undefined> {
    return getBridge().sessionsExport(id);
  },
  onSessionsUpdated(cb: () => void) {
    getBridge().onSessionsUpdated(cb);
  },
  async executionRecord(record: ExecutionRecord): Promise<void> {
    return getBridge().executionRecord(record);
  },
  async executionList(): Promise<ExecutionRecord[]> {
    return getBridge().executionList();
  },
  onExecutionUpdated(cb: () => void) {
    getBridge().onExecutionUpdated(cb);
  },
  async browserGetCapabilities(): Promise<BrowserCapabilityReport[]> {
    return getBridge().browserGetCapabilities();
  },
  onProcessOutput(cb: (event: ProcessOutputEvent) => void) {
    getBridge().onProcessOutput(cb);
  },
  onProcessExit(cb: (event: ProcessExitEvent) => void) {
    getBridge().onProcessExit(cb);
  },
  onWorkspaceFileChanged(cb: (event: WorkspaceFileChangeEvent) => void) {
    getBridge().onWorkspaceFileChanged(cb);
  },
  onWorkspaceObservation(cb: (event: WorkspaceObservationEvent) => void) {
    getBridge().onWorkspaceObservation(cb);
  },
  async communicationSaveAudio(communicationId: string, base64Data: string, mimeType: string) {
    return getBridge().communicationSaveAudio(communicationId, base64Data, mimeType);
  },
  async communicationAppendRecordingChunk(communicationId: string, kind: 'audio' | 'video', base64Chunk: string, expectedChecksum?: string) {
    return getBridge().communicationAppendRecordingChunk(communicationId, kind, base64Chunk, expectedChecksum);
  },
  async communicationFinalizeRecording(communicationId: string, kind: 'audio' | 'video', mimeType: string) {
    return getBridge().communicationFinalizeRecording(communicationId, kind, mimeType);
  },
  async communicationGetRecordingDiagnostics(communicationId: string) {
    return getBridge().communicationGetRecordingDiagnostics(communicationId);
  },
  async communicationDeleteRecording(communicationId: string) {
    return getBridge().communicationDeleteRecording(communicationId);
  },
  async communicationGetRecordingTimeline(communicationId: string) {
    return getBridge().communicationGetRecordingTimeline(communicationId);
  },
  async communicationGenerateEvidence(communicationId: string, apiKey: string, model?: string, baseUrl?: string) {
    return getBridge().communicationGenerateEvidence(communicationId, apiKey, model, baseUrl);
  },
  async communicationGetEvidence(communicationId: string) {
    return getBridge().communicationGetEvidence(communicationId);
  },
  async communicationGenerateBusinessInsights(communicationId: string, apiKey: string, model?: string, baseUrl?: string) {
    return getBridge().communicationGenerateBusinessInsights(communicationId, apiKey, model, baseUrl);
  },
  async communicationGetBusinessInsights(communicationId: string) {
    return getBridge().communicationGetBusinessInsights(communicationId);
  },
  onCommunicationEvent(cb: (event: CommunicationRuntimeEvent) => void) {
    getBridge().onCommunicationEvent(cb);
  },
  async communicationListLocalParticipants(): Promise<ParticipantRecord[]> {
    return getBridge().communicationListLocalParticipants();
  },
  async communicationListLocalCompanies(): Promise<CompanyRecord[]> {
    return getBridge().communicationListLocalCompanies();
  },
  async communicationListLocalSummaries(): Promise<CommunicationSummary[]> {
    return getBridge().communicationListLocalSummaries();
  },
  async communicationListLocalFollowUps(): Promise<FollowUp[]> {
    return getBridge().communicationListLocalFollowUps();
  },

  async connectivityListConnectors(): Promise<ConnectivityIpcResult<ConnectorDefinition[]>> {
    return getBridge().connectivityListConnectors();
  },
  async connectivityListConnections(scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorConnection[]>> {
    return getBridge().connectivityListConnections(scope);
  },
  async connectivityConnect(connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorConnection>> {
    return getBridge().connectivityConnect(connectorId, scope);
  },
  async connectivityGetStatus(connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<ConnectorStatus>> {
    return getBridge().connectivityGetStatus(connectorId, scope);
  },
  async connectivityRestore(connectorId: string, scope: ConnectivityScope, credential: unknown): Promise<ConnectivityIpcResult<ConnectorStatus>> {
    return getBridge().connectivityRestore(connectorId, scope, credential);
  },
  async connectivityDisconnect(connectionId: string): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityDisconnect(connectionId);
  },
  async connectivityCheckHealth(connectionId: string): Promise<ConnectivityIpcResult<ConnectorConnection>> {
    return getBridge().connectivityCheckHealth(connectionId);
  },
  async connectivityRefreshDiscovery(): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityRefreshDiscovery();
  },
  async connectivityVerifyPullRequestExists(prUrl: string): Promise<ConnectivityIpcResult<{ verified: boolean; reason: string }>> {
    return getBridge().connectivityVerifyPullRequestExists(prUrl);
  },
  async connectivityPostAutonomousCompletionComment(prUrl: string, body: string): Promise<ConnectivityIpcResult<{ posted: boolean; reason: string; commentUrl?: string }>> {
    return getBridge().connectivityPostAutonomousCompletionComment(prUrl, body);
  },
  async connectivityDeploymentProfilesCreate(
    scope: ConnectivityScope,
    name: string,
    config: DeploymentProfileConfig
  ): Promise<ConnectivityIpcResult<DeploymentProfile>> {
    return getBridge().connectivityDeploymentProfilesCreate(scope, name, config);
  },
  async connectivityDeploymentProfilesGet(profileId: string): Promise<ConnectivityIpcResult<DeploymentProfile | undefined>> {
    return getBridge().connectivityDeploymentProfilesGet(profileId);
  },
  async connectivityDeploymentProfilesList(scope: ConnectivityScope): Promise<ConnectivityIpcResult<DeploymentProfile[]>> {
    return getBridge().connectivityDeploymentProfilesList(scope);
  },
  async connectivityDeploymentProfilesUpdate(
    profileId: string,
    patch: Partial<Pick<DeploymentProfile, 'name' | 'config' | 'isDefault'>>
  ): Promise<ConnectivityIpcResult<DeploymentProfile>> {
    return getBridge().connectivityDeploymentProfilesUpdate(profileId, patch);
  },
  async connectivityDeploymentProfilesRemove(profileId: string): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityDeploymentProfilesRemove(profileId);
  },
  async connectivityApiTokensValidate(connectorId: string, token: string): Promise<ConnectivityIpcResult<ApiTokenValidationResult>> {
    return getBridge().connectivityApiTokensValidate(connectorId, token);
  },
  async connectivityApiTokensSave(connectorId: string, scope: ConnectivityScope, token: string): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityApiTokensSave(connectorId, scope, token);
  },
  async connectivityOAuthBegin(connectorId: string, scope: ConnectivityScope): Promise<ConnectivityIpcResult<OAuthBeginResult>> {
    return getBridge().connectivityOAuthBegin(connectorId, scope);
  },
  async connectivityOAuthCancel(requestId: string): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityOAuthCancel(requestId);
  },
  async connectivityDeploymentProfilesHydrate(profile: DeploymentProfile): Promise<ConnectivityIpcResult<void>> {
    return getBridge().connectivityDeploymentProfilesHydrate(profile);
  },
};

export type IpcApi = typeof ipc;

export type IpcSettings = SettingsState;
