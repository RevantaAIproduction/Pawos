import { app, BrowserWindow, ipcMain } from 'electron';
import { SettingsStore } from '../../shared/settings/SettingsStore';
import { CompanionLoader } from '../../shared/CompanionLoader';
import type { CompanionCommand } from '../../shared/companion/CompanionCommand';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { desktopExecutionEngine } from '../execution/DesktopExecutionEngine';
import { processManager } from '../execution/ProcessManager';
import { fileWatcherManager } from '../execution/FileWatcher';
import { workspaceMemoryStore } from '../execution/WorkspaceMemoryStore';
import { getAnimationsDir, getCharactersDir, getPetsDir } from '../assets/AssetPathResolver';
import type { ForegroundWindowInfo } from '../../shared/system/ForegroundWindowInfo';
import type { GoogleProfile } from '../../shared/auth/AccountTypes';
import { emailService } from '../mail/EmailService';
import { listMailTemplates, renderMailPreview } from '../mail/preview';
import { createOtp, verifyOtp } from '../mail/otp';
import { conversationSessionStore } from '../conversation/ConversationSessionStore';
import type { ConversationSessionTurn, SessionContinuationHint } from '../../shared/conversation/ConversationSessionTypes';
import { executionMemoryStore } from '../execution/ExecutionMemoryStore';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { browserRuntime } from '../execution/browser/BrowserRuntime';
import { communicationRuntime } from '../communication/CommunicationRuntime';
import type { CommunicationRuntimeEvent } from '../../shared/communication/CommunicationTypes';

function toFileUrl(dir: string): string {
  return `file://${dir.replace(/\\/g, '/')}/`;
}

export function registerIpc(opts: {
  app: typeof app;
  overlayWindowProvider: () => BrowserWindow | null;
  getScreenWorkArea: () => { width: number; height: number };
  setOverlayInteractive: (active: boolean) => boolean;
  enableCompanion: () => void;
  disableCompanion: () => void;
  isCompanionEnabled: () => boolean;
  getEnvApiKeys: () => { gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string };
  getForegroundWindowInfo: () => ForegroundWindowInfo;
  isGoogleSignInConfigured: () => boolean;
  startGoogleSignIn: () => Promise<GoogleProfile>;
}) {
  ipcMain.handle('companion:enable', () => {
    opts.enableCompanion();
    return true;
  });

  ipcMain.handle('companion:disable', () => {
    opts.disableCompanion();
    return true;
  });

  ipcMain.handle('companion:isEnabled', () => opts.isCompanionEnabled());

  // Relays a backend command (setEmotion/playAnimation/lookAt/setMood/setContext)
  // to whichever window is actually rendering the companion. Lets any window
  // (e.g. the dashboard) command the one companion without holding a direct
  // reference to its React tree.
  ipcMain.handle('companion:command', (_evt, command: CompanionCommand) => {
    opts.overlayWindowProvider()?.webContents.send('companion:command', command);
    return true;
  });

  // The Desktop Execution Engine's pipeline, one IPC call per stage — lets
  // the conversation layer collect missing info and narrate naturally
  // without duplicating any plugin's own logic.
  ipcMain.handle('action:checkRequirements', (_evt, request: ActionRequest) => desktopExecutionEngine.requirements(request));
  ipcMain.handle('action:describe', (_evt, request: ActionRequest) => desktopExecutionEngine.describeInProgress(request));
  ipcMain.handle('action:execute', (_evt, request: ActionRequest) => desktopExecutionEngine.execute(request));
  ipcMain.handle('action:reportResult', (_evt, request: ActionRequest, result: ActionResult) =>
    desktopExecutionEngine.describeDone(request, result)
  );

  // Live output from anything started via startProcess — broadcast to every
  // window (same shape as sessions:updated) so the conversation panel can
  // keep updating one message as a dev server/build tool produces output.
  processManager.on('output', (event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('process:output', event);
  });
  processManager.on('exit', (event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('process:exit', event);
  });

  // A file changed outside Paw's own actions (e.g. the user editing in real
  // VS Code) — marks the workspace's cached analysis stale and lets the
  // renderer react live, same push-channel shape as process:output.
  fileWatcherManager.on('change', (event) => {
    workspaceMemoryStore.markStale(event.rootPath);
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('workspace:fileChanged', event);
  });

  // Intermediate signals a plugin's observe() yields mid-action (e.g. "Waiting
  // for port 3000…") — same push-channel shape as process:output, lets the
  // renderer upgrade a static "Installing…" narration message into a live one.
  desktopExecutionEngine.on('observation', (event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('workspace:observation', event);
  });

  ipcMain.handle('assets:getAnimationsBaseUrl', () => toFileUrl(getAnimationsDir()));
  ipcMain.handle('assets:getCharactersBaseUrl', () => toFileUrl(getCharactersDir()));

  ipcMain.handle('settings:get', () => SettingsStore.getState());
  ipcMain.handle('settings:set', async (_evt, partial: any) => {
    SettingsStore.update(partial);
    const win = opts.overlayWindowProvider();
    win?.webContents.send('settings:updated', SettingsStore.getState());
    return SettingsStore.getState();
  });

  ipcMain.handle('pets:list', async () => {
    const pets = await CompanionLoader.listCompanions(getPetsDir());
    return pets.map((p) => ({ id: p.id, name: p.name }));
  });

  ipcMain.handle('pets:load', async (_evt, petId: string) => {
    const pet = await CompanionLoader.loadCompanion(petId, getPetsDir());
    // Shared CompanionLoader returns a renderer-usable serialized shape.
    return pet;
  });

  ipcMain.on('ui:open-settings', () => {
    opts.overlayWindowProvider()?.webContents.send('ui:open-settings');
  });

  // Lets the overlay's own renderer slide itself across the desktop for the
  // idle "walk around" behavior — only the overlay window (never the main
  // dashboard) can be moved this way, and only ever within the primary
  // display's work area (clamped below).
  ipcMain.handle('overlay:moveWindow', (_evt, x: number, y: number) => {
    const win = opts.overlayWindowProvider();
    if (!win) return false;
    win.setPosition(Math.round(x), Math.round(y));
    return true;
  });

  ipcMain.handle('overlay:getWindowBounds', () => {
    const win = opts.overlayWindowProvider();
    return win ? win.getBounds() : null;
  });

  ipcMain.handle('overlay:getScreenWorkArea', () => opts.getScreenWorkArea());

  // Workspace Runtime — the overlay window never resizes; instead this
  // toggles click-through (setIgnoreMouseEvents) so the mostly-transparent
  // canvas only intercepts clicks while the cursor is over real, visible
  // content. See setOverlayInteractive in main.ts.
  ipcMain.handle('overlay:setInteractive', (_evt, active: boolean) => opts.setOverlayInteractive(active));

  // Reads from a .env file on disk (see src/main/env/readEnvFile.ts) — lets
  // the user drop keys in a file instead of typing them into the app.
  // Never exposed beyond this one-shot fetch; the renderer only uses it to
  // seed AIProviderConfigStore/the Supabase client if not already configured.
  ipcMain.handle('env:getApiKeys', () => opts.getEnvApiKeys());

  // Polled by the companion's environment-awareness behavior — see
  // src/main/system/ForegroundWindowWatcher.ts and ActionController.
  ipcMain.handle('system:getForegroundWindowInfo', () => opts.getForegroundWindowInfo());

  ipcMain.handle('auth:isGoogleSignInConfigured', () => opts.isGoogleSignInConfigured());
  ipcMain.handle('auth:startGoogleSignIn', () => opts.startGoogleSignIn());

  // Email-ownership verification for account creation — generates and
  // hashes a real 6-digit code (src/main/mail/otp.ts) and sends it via the
  // real OTP email template, independent of whatever Supabase's own project
  // settings do for email confirmation (see EmailAuthProvider.ts).
  ipcMain.handle('auth:sendOtp', async (_evt, email: string) => {
    const { code, expiresInMinutes } = await createOtp(email);
    await emailService.sendOTP(email, { code, expiresInMinutes });
    return { expiresInMinutes };
  });
  ipcMain.handle('auth:verifyOtp', (_evt, email: string, code: string) => verifyOtp(email, code));

  // Single dispatcher over EmailService's public send* methods — every
  // outbound PawOS email (transactional or marketing) is routed through
  // here rather than each caller needing its own IPC channel.
  ipcMain.handle('mail:send', async (_evt, method: string, to: string, params: unknown) => {
    if (!method.startsWith('send') || typeof (emailService as any)[method] !== 'function') {
      throw new Error(`Unknown mail method: ${method}`);
    }
    await (emailService as any)[method](to, params);
    return true;
  });

  // Mail preview page — renders every template with fixed dummy data, never sends anything.
  ipcMain.handle('mail:listTemplates', () => listMailTemplates());
  ipcMain.handle('mail:renderPreview', (_evt, key: string) => renderMailPreview(key));

  // Electron's memory of every conversation. Written only by
  // ConversationRuntime finalizing a turn; every other channel here is
  // read/organize-only (search/pin/archive/rename/export/delete) — the
  // renderer never edits a turn's recorded content.
  ipcMain.handle('sessions:list', () => conversationSessionStore.list());
  ipcMain.handle('sessions:get', (_evt, id: string) => conversationSessionStore.get(id));
  ipcMain.handle('sessions:search', (_evt, query: string) => conversationSessionStore.search(query));
  ipcMain.handle('sessions:appendTurn', (_evt, turn: ConversationSessionTurn, hint?: SessionContinuationHint) => {
    const session = conversationSessionStore.appendTurn(turn, hint);
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('sessions:updated');
    return session;
  });
  ipcMain.handle('sessions:rename', (_evt, id: string, title: string) => conversationSessionStore.rename(id, title));
  ipcMain.handle('sessions:setPinned', (_evt, id: string, pinned: boolean) => conversationSessionStore.setPinned(id, pinned));
  ipcMain.handle('sessions:setArchived', (_evt, id: string, archived: boolean) =>
    conversationSessionStore.setArchived(id, archived)
  );
  ipcMain.handle('sessions:delete', (_evt, id: string) => conversationSessionStore.delete(id));
  ipcMain.handle('sessions:export', (_evt, id: string) => conversationSessionStore.export(id));

  // Work History — one already-finished ExecutionRecord per write, built by
  // the renderer's ExecutionSupervisor as a user request completes. Read-only
  // from here on (list), same shape as the sessions:* channels above.
  ipcMain.handle('execution:record', (_evt, record: ExecutionRecord) => {
    executionMemoryStore.record(record);
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('execution:updated');
  });
  ipcMain.handle('execution:list', () => executionMemoryStore.list());

  // Browser Capabilities dashboard page — read-only, direct from
  // BrowserRuntime (same source of truth every browser plugin's
  // capability gate uses), no AI round-trip needed for a data fetch.
  ipcMain.handle('browser:getCapabilities', () => browserRuntime.getCapabilities());

  // Communication Intelligence Runtime — the renderer owns real mic/system-
  // audio capture (getUserMedia/desktopCapturer/MediaRecorder, same
  // pattern as GeminiSttProvider.ts); this is the one handoff point where
  // the finished recording's bytes cross into main-process storage. Kept
  // as its own channel (not the generic action:execute pipeline) since
  // it's a large binary payload and an implementation detail of stopping a
  // capture, not a user-facing action with its own narration.
  ipcMain.handle('communication:saveAudio', (_evt, communicationId: string, base64Data: string, mimeType: string) =>
    communicationRuntime.saveAudioChunk(communicationId, base64Data, mimeType)
  );

  // Live push channel for the Communication Workspace (liveTranscript/
  // participants/actionItems/evidence regions) and Task Card status —
  // same shape as workspace:observation/process:output above.
  communicationRuntime.subscribe((event: CommunicationRuntimeEvent) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('communication:event', event);
  });
}

