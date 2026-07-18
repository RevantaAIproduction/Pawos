import type { SettingsState } from './ipcTypes';
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

    overlayMoveWindow: async (x: number, y: number): Promise<boolean> => ipcApi.invoke('overlay:moveWindow', x, y),
    overlayGetWindowBounds: async (): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      ipcApi.invoke('overlay:getWindowBounds'),
    overlayGetScreenWorkArea: async (): Promise<{ width: number; height: number }> => ipcApi.invoke('overlay:getScreenWorkArea'),
    overlaySetInteractive: async (active: boolean): Promise<boolean> => ipcApi.invoke('overlay:setInteractive', active),

    envGetApiKeys: async (): Promise<{ gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string }> =>
      ipcApi.invoke('env:getApiKeys'),

    systemGetForegroundWindowInfo: async (): Promise<ForegroundWindowInfo> => ipcApi.invoke('system:getForegroundWindowInfo'),

    authIsGoogleSignInConfigured: async (): Promise<boolean> => ipcApi.invoke('auth:isGoogleSignInConfigured'),
    authStartGoogleSignIn: async (): Promise<GoogleProfile> => ipcApi.invoke('auth:startGoogleSignIn'),
    authSendOtp: async (email: string): Promise<{ expiresInMinutes: number }> => ipcApi.invoke('auth:sendOtp', email),
    authVerifyOtp: async (email: string, code: string): Promise<{ valid: boolean; reason?: string }> =>
      ipcApi.invoke('auth:verifyOtp', email, code),

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
  };
}

