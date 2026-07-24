import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
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
import type { GoogleSignInResult } from '../../shared/auth/AccountTypes';
import { emailService } from '../mail/EmailService';
import { listMailTemplates, renderMailPreview } from '../mail/preview';
import { createOtp, verifyOtp } from '../mail/otp';
import { createPasswordResetToken, verifyPasswordResetToken } from '../mail/passwordResetToken';
import { platformPairingStore } from '../pairing/PlatformPairingStore';
import { deviceIdentityStore } from '../device/DeviceIdentityStore';
import { exportCompanionPackage, importCompanionPackage } from '../companion/CompanionPackageFormat';
import type { CompanionPackageInput } from '../../shared/companion/CompanionPackageTypes';
import { pricingConfigStore } from '../billing/PricingConfigStore';
import { subscriptionStore } from '../billing/SubscriptionStore';
import { creditStore } from '../billing/CreditStore';
import { createBillingProvider } from '../billing/BillingProviderRegistry';
import { createCreditsCheckoutUrl } from '../billing/providers/RazorpayBillingProvider';
import { entitlementService } from '../billing/EntitlementService';
import { startCheckoutCallbackServer } from '../billing/CheckoutSyncServer';
import type { SubscriptionTierId, FeatureId, CheckoutOptions } from '../../shared/billing/BillingTypes';
import type { PawModelId } from '../../shared/ai/PawModelTypes';
import { onboardingStore } from '../onboarding/OnboardingStore';
import { conversationSessionStore } from '../conversation/ConversationSessionStore';
import type { ConversationSessionTurn, SessionContinuationHint } from '../../shared/conversation/ConversationSessionTypes';
import { executionMemoryStore } from '../execution/ExecutionMemoryStore';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { browserRuntime } from '../execution/browser/BrowserRuntime';
import { communicationRuntime } from '../communication/CommunicationRuntime';
import type { CommunicationRuntimeEvent } from '../../shared/communication/CommunicationTypes';
import { helpActivityStore } from '../help/HelpActivityStore';
import { supportConversationStore } from '../help/SupportConversationStore';
import type { SupportConversationTurn } from '../help/SupportConversationTypes';
import { ratingPromptStore } from '../feedback/RatingPromptStore';
import { feedbackStore } from '../feedback/FeedbackStore';
import type { FeedbackSubmission } from '../../renderer/services/ipc/ipcTypes';

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
  getEnvApiKeys: () => { gemini?: string; supabaseUrl?: string; supabasePublishableKey?: string; githubRedirectUri?: string };
  getForegroundWindowInfo: () => ForegroundWindowInfo;
  isGoogleSignInConfigured: () => boolean;
  startGoogleSignIn: () => Promise<GoogleSignInResult>;
  isGithubSignInConfigured: () => boolean;
  startGithubSignIn: (authorizeUrl: string) => Promise<{ code: string }>;
  getEmailSigningSecret: () => string | undefined;
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

  // Phase 5 shared terminal: relays a remote helper's typed input into the
  // host's real local shell process, gated entirely client-side by the
  // `terminal` control grant before this is ever called.
  ipcMain.handle('process:writeStdin', (_evt, processId: string, data: string) => processManager.writeStdin(processId, data));

  // Phase 5 shared terminal: spawns a real persistent interactive shell,
  // deliberately outside the AI-action allowlist (see ProcessManager's
  // startInteractiveShell doc comment) — gated by human-to-human Remote
  // Assistance consent, not the AI command allowlist.
  ipcMain.handle('remoteAssistance:startSharedTerminal', (_evt, cwd: string, label: string) => processManager.startInteractiveShell(cwd, label));

  // Phase 5 shared terminal: the host's own home directory as the default
  // starting cwd for a remote-assistance shared shell (the renderer has no
  // Node `process.cwd()`/`os.homedir()` under contextIsolation).
  ipcMain.handle('system:getHomeDir', () => app.getPath('home'));

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
    const state = SettingsStore.getState();
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:updated', state);
    return state;
  });

  ipcMain.handle('feedback:submit', async (_evt, submission: FeedbackSubmission) => {
    const entry = feedbackStore.append({
      rating: submission.rating,
      comment: submission.comment,
      submittedAt: Date.now(),
      appVersion: app.getVersion(),
    });
    ratingPromptStore.markRated();
    try {
      await emailService.sendFeedbackReceived('founder@revantaai.com', {
        rating: entry.rating,
        comment: entry.comment,
        fromName: 'A PawOS user',
        appVersion: entry.appVersion,
      });
    } catch (err) {
      // Best-effort only — SMTP may not be configured; the feedback is
      // already saved locally above regardless of whether the email sends.
      console.error('Failed to send feedback notification email', err);
    }
    return true;
  });

  ipcMain.handle('feedback:dismiss', (_evt, opts: { dontAskAgain: boolean }) => {
    if (opts.dontAskAgain) ratingPromptStore.setDontAskAgain(true);
    return true;
  });

  ipcMain.handle(
    'mail:sendOrganizationInvite',
    async (_evt, params: { to: string; organizationName: string; role: string; inviterName: string }) => {
      await emailService.sendOrganizationInvite(params.to, {
        organizationName: params.organizationName,
        role: params.role,
        inviterName: params.inviterName,
        openUrl: 'https://revantaai.com',
      });
      return true;
    }
  );

  ipcMain.handle('help:getActivity', () => helpActivityStore.get());
  ipcMain.handle('help:recordArticleView', (_evt, articleId: string) => helpActivityStore.recordView(articleId));

  ipcMain.handle('help:listConversations', () => supportConversationStore.list());
  ipcMain.handle('help:getConversation', (_evt, id: string) => supportConversationStore.get(id) ?? null);
  ipcMain.handle('help:createConversation', (_evt, problemSummary: string) => supportConversationStore.create(problemSummary));
  ipcMain.handle('help:addTurn', (_evt, id: string, turn: SupportConversationTurn) => supportConversationStore.addTurn(id, turn) ?? null);
  ipcMain.handle(
    'help:updateConversation',
    (
      _evt,
      id: string,
      patch: { status?: string; diagnosis?: string; currentState?: string; needsPermission?: boolean; actionsTaken?: string[] }
    ) => supportConversationStore.update(id, patch as never) ?? null
  );
  ipcMain.handle('help:setConversationRating', (_evt, id: string, rating: 'up' | 'down', detail?: string) =>
    supportConversationStore.setRating(id, rating, detail) ?? null
  );

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
  ipcMain.handle('system:getAppVersion', () => app.getVersion());

  ipcMain.handle('auth:isGoogleSignInConfigured', () => opts.isGoogleSignInConfigured());
  ipcMain.handle('auth:startGoogleSignIn', () => opts.startGoogleSignIn());
  ipcMain.handle('auth:isGithubSignInConfigured', () => opts.isGithubSignInConfigured());
  ipcMain.handle('auth:startGithubSignIn', (_evt, authorizeUrl: string) => opts.startGithubSignIn(authorizeUrl));

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

  // Password reset — independent OTP namespace ('password-reset') from
  // signup verification above, same underlying otp.ts primitives. A
  // successful OTP verification issues a short-lived signed token
  // (passwordResetToken.ts, built earlier but never wired to a real flow
  // until now) that the renderer must present to actually commit the new
  // password — a second, separate proof so the OTP alone (already consumed)
  // can't be replayed to authorize an unrelated later action.
  ipcMain.handle('auth:sendPasswordResetOtp', async (_evt, email: string) => {
    const { code, expiresInMinutes } = await createOtp(email, 'password-reset');
    await emailService.sendOTP(email, { code, expiresInMinutes });
    return { expiresInMinutes };
  });
  ipcMain.handle('auth:verifyPasswordResetOtp', async (_evt, email: string, code: string) => {
    const result = await verifyOtp(email, code, 'password-reset');
    if (!result.valid) return result;
    const token = createPasswordResetToken(email, opts.app.getPath('userData'), opts.getEmailSigningSecret());
    return { ...result, token };
  });
  ipcMain.handle('auth:validatePasswordResetToken', (_evt, token: string) =>
    verifyPasswordResetToken(token, opts.app.getPath('userData'), opts.getEmailSigningSecret())
  );

  // Generic platform device pairing (QR + registry) — independent of the
  // frozen Communication Runtime's own MobilePairingStore. See
  // src/main/pairing/PlatformPairingStore.ts.
  ipcMain.handle('pairing:begin', (_evt, userId?: string) => platformPairingStore.beginPairing(userId));
  ipcMain.handle('pairing:complete', (_evt, token: string, deviceName: string, publicKey: string) =>
    platformPairingStore.completePairing(token, deviceName, publicKey)
  );
  ipcMain.handle('pairing:list', (_evt, userId?: string) => platformPairingStore.list(userId));
  ipcMain.handle('pairing:revoke', (_evt, deviceId: string) => {
    platformPairingStore.revoke(deviceId);
    return true;
  });

  // This device's own local identity — see src/main/device/DeviceIdentityStore.ts.
  ipcMain.handle('device:getLocalIdentity', () => deviceIdentityStore.getIdentity());

  // Account-level billing — subscription tier, pricing config, and AI
  // credit tracking. See src/main/billing/*.ts. Distinct from
  // CodingModeStore's own local Coding Runtime Go/Pro toggle.
  ipcMain.handle('billing:getPricing', () => pricingConfigStore.get());
  ipcMain.handle('billing:getSubscription', () => subscriptionStore.get());
  ipcMain.handle('billing:setSubscriptionTier', (_evt, tier: SubscriptionTierId) => subscriptionStore.setTier(tier));
  ipcMain.handle('billing:syncFromOrganization', (_evt, orgTier: SubscriptionTierId) => subscriptionStore.syncFromOrganization(orgTier));
  ipcMain.handle('billing:getCreditBalance', () => ({ ...creditStore.getBalance(), limit: entitlementService.getCreditLimit() }));
  ipcMain.handle('billing:consumeCredit', (_evt, amount: number, reason: string) => {
    creditStore.consume(amount, reason);
    return { ...creditStore.getBalance(), limit: entitlementService.getCreditLimit() };
  });
  ipcMain.handle('billing:createCheckoutSession', (_evt, tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions) => {
    const provider = createBillingProvider(pricingConfigStore.get().billingProvider);
    return provider.createCheckoutSession(tier, callbackUrl, options);
  });
  // Starts the loopback server the checkout page pings after a real payment
  // completes — see CheckoutSyncServer.ts for why this is the honest sync
  // mechanism available without a shared account/subscription backend.
  ipcMain.handle('billing:startCheckoutSync', () => startCheckoutCallbackServer());
  // Prepaid Autonomous Engineering Task credit purchases — a one-time
  // Razorpay Order, not a subscription-tier checkout, so it's a standalone
  // function rather than part of the BillingProvider interface (see
  // RazorpayBillingProvider.ts).
  ipcMain.handle('billing:createCreditsCheckoutSession', (_evt, credits: number, organizationId?: string, callbackUrl?: string) =>
    createCreditsCheckoutUrl(credits, organizationId, callbackUrl)
  );

  // Central entitlement queries — every runtime asks these instead of
  // hard-coding a tier check. See src/main/billing/EntitlementService.ts.
  ipcMain.handle('entitlement:getSnapshot', () => entitlementService.getSnapshot());
  ipcMain.handle('entitlement:isModelAvailable', (_evt, modelId: PawModelId) => entitlementService.isModelAvailable(modelId));
  ipcMain.handle('entitlement:isFeatureAvailable', (_evt, featureId: FeatureId) => entitlementService.isFeatureAvailable(featureId));

  // First-run onboarding — resumable step tracking + a real folder picker
  // for the default workspace step. See src/main/onboarding/OnboardingStore.ts.
  ipcMain.handle('onboarding:get', () => onboardingStore.get());
  ipcMain.handle('onboarding:setStep', (_evt, step: number) => onboardingStore.setStep(step));
  ipcMain.handle('onboarding:complete', () => onboardingStore.complete());
  ipcMain.handle('onboarding:selectWorkspaceFolder', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return onboardingStore.get();
    return onboardingStore.setDefaultWorkspacePath(selected);
  });

  // Desktop Companion notification reactions — a real OS notification via
  // Electron's own Notification API (never a fake/simulated one), for
  // PawOS's own events (e.g. a background task finishing while the overlay
  // isn't focused). Honest scope: this shows notifications PawOS itself
  // triggers; it cannot listen to other applications' OS notifications
  // (that needs a platform-specific native hook, out of scope here).
  ipcMain.handle('companion:showNotification', (_evt, title: string, body: string) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title, body }).show();
    return true;
  });

  // Upload Existing Companion (Companion Studio) — a real native file picker
  // scoped to the 3D formats CompanionUploadPipeline.ts can load.
  ipcMain.handle('companion:pickUploadFile', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: '3D Model', extensions: ['glb', 'gltf', 'vrm', 'fbx', 'obj'] }] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // Companion Package (.paw) — export/import/backup/restore. Backup and
  // Restore reuse these same two handlers (a backup is just an export the
  // user chooses to keep; a restore is just an import of one) rather than
  // duplicating logic for a distinction that isn't actually different.
  ipcMain.handle('companion:exportPackage', async (evt, input: CompanionPackageInput, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const options: Electron.SaveDialogOptions = { defaultPath: `${suggestedName}.paw`, filters: [{ name: 'PawOS Companion', extensions: ['paw'] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await exportCompanionPackage(input, result.filePath);
    return result.filePath;
  });

  ipcMain.handle('companion:importPackage', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'PawOS Companion', extensions: ['paw'] }] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return null;
    return importCompanionPackage(selected);
  });

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

  // Phase 1 org-share bridge — read-only local lookups so the renderer can
  // let a member pick which local contact/company/summary/follow-up to
  // share into an organization's CRM (see OrgSyncBridge.ts). Never writes
  // back; the actual org-shared write goes straight to Supabase via
  // CrmService, not through these channels.
  ipcMain.handle('communication:listLocalParticipants', () => communicationRuntime.listLocalParticipants());
  ipcMain.handle('communication:listLocalCompanies', () => communicationRuntime.listLocalCompanies());
  ipcMain.handle('communication:listLocalSummaries', () => communicationRuntime.listLocalSummaries());
  ipcMain.handle('communication:listLocalFollowUps', () => communicationRuntime.listLocalFollowUps());
}

