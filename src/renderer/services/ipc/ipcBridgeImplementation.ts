import type { SettingsState } from './ipcTypes';
import { getIpcBridge } from './ipcBridge';
import type { CompanionCommand } from '../../../shared/companion/CompanionCommand';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ForegroundWindowInfo } from '../../../shared/system/ForegroundWindowInfo';
import type { GoogleProfile } from '../../../shared/auth/AccountTypes';
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
  async envGetApiKeys(): Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string }> {
    return getBridge().envGetApiKeys();
  },
  async systemGetForegroundWindowInfo(): Promise<ForegroundWindowInfo> {
    return getBridge().systemGetForegroundWindowInfo();
  },
  async authIsGoogleSignInConfigured(): Promise<boolean> {
    return getBridge().authIsGoogleSignInConfigured();
  },
  async authStartGoogleSignIn(): Promise<GoogleProfile> {
    return getBridge().authStartGoogleSignIn();
  },
  async authSendOtp(email: string): Promise<{ expiresInMinutes: number }> {
    return getBridge().authSendOtp(email);
  },
  async authVerifyOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
    return getBridge().authVerifyOtp(email, code);
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
  onCommunicationEvent(cb: (event: CommunicationRuntimeEvent) => void) {
    getBridge().onCommunicationEvent(cb);
  },
};

export type IpcApi = typeof ipc;

export type IpcSettings = SettingsState;

