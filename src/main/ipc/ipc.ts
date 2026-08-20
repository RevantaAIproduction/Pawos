import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import { SettingsStore } from '../../shared/settings/SettingsStore';
import { CompanionLoader } from '../../shared/CompanionLoader';
import type { CompanionCommand } from '../../shared/companion/CompanionCommand';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { desktopExecutionEngine } from '../execution/DesktopExecutionEngine';
import { platformEventBus } from '../platform/events/PlatformEventBus';
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
import { deviceIdentityStore } from '../device/DeviceIdentityStore';
import { pushNotificationService } from '../notifications/PushNotificationService';
import type { PushNotificationPayload } from '../notifications/PushNotificationService';
import { exportCompanionPackage, importCompanionPackage } from '../companion/CompanionPackageFormat';
import type { CompanionPackageInput } from '../../shared/companion/CompanionPackageTypes';
import { pricingConfigStore } from '../billing/PricingConfigStore';
import { ticketPricingConfigStore } from '../billing/TicketPricingConfigStore';
import { subscriptionStore } from '../billing/SubscriptionStore';
import { rollingUsageGate } from '../billing/RollingUsageGate';
import { creditStore } from '../billing/CreditStore';
import { recordTurnUsage, recordUsageEvent } from '../billing/UsageMeteringEngine';
import { usageEventStore } from '../billing/UsageEventStore';
import type { ProviderUsageMetadata, TurnUsageSubmission, UsageRequestType } from '../../shared/billing/UsageMeteringTypes';
import { createBillingProvider } from '../billing/BillingProviderRegistry';
import { createCreditsCheckoutUrl } from '../billing/providers/RazorpayBillingProvider';
import { verifyRealOrganizationTier } from '../billing/OrganizationTierVerification';
import { entitlementService } from '../billing/EntitlementService';
import { createRendererOrganizationUsageRecorder } from '../billing/RendererOrganizationUsageBridge';
import { startCheckoutCallbackServer, verifySubscriptionWithBackend } from '../billing/CheckoutSyncServer';
import type {
  SubscriptionTierId,
  FeatureId,
  CheckoutOptions,
  SeatTier,
  RuntimeEntitlementId,
  NativeSubscriptionCheckoutResult,
  NativeCreditsCheckoutResult,
  NativeCreditsVerificationResult,
} from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS } from '../../shared/billing/RuntimeCatalog';
import type { AiUsageCategory } from '../../shared/billing/AiUsageCategories';

const PAWOS_BILLING_API_BASE_URL = 'https://pawos.revantaai.com';

const VALID_NATIVE_BILLING_TIERS: SubscriptionTierId[] = ['pro', 'proMax', 'team', 'enterprise'];

function cleanReason(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'reason' in value) return String((value as { reason: unknown }).reason);
  return fallback;
}

function parseVerifiedRuntimeIds(value: string[]): RuntimeEntitlementId[] {
  const valid = new Set<string>(ALL_RUNTIME_ENTITLEMENT_IDS);
  return value.filter((runtimeId, index, list): runtimeId is RuntimeEntitlementId => valid.has(runtimeId) && list.indexOf(runtimeId) === index);
}
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
import { registerConnectivityIpc } from './connectivityIpc';

function toFileUrl(dir: string): string {
  return `file://${dir.replace(/\\/g, '/')}/`;
}

export function registerIpc(opts: {
  app: typeof app;
  overlayWindowProvider: () => BrowserWindow | null;
  mainWindowProvider: () => BrowserWindow | null;
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

  // The overlay window's 3D asset load finishes well after companion:enable
  // already resolved (that call just creates the window and returns) — this
  // lets the dashboard's "Enable companion" button keep showing a real
  // loading state until the companion is actually visually ready, instead of
  // claiming success the moment the (still-loading) window exists.
  ipcMain.on('companion:ready', () => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('companion:ready:broadcast');
  });

  // Forwards a renderer-detected window.onerror/unhandledrejection (see
  // src/renderer/platform/RendererCrashGuard.ts) into the Platform Event
  // Bus as a real crash event — the renderer process has no direct access
  // to the bus, which lives only in the main process.
  ipcMain.on('platform:reportRendererEvent', (_event, payload: { message?: string; stack?: string }) => {
    platformEventBus.reportRuntimeEvent({
      kind: 'crash',
      runtime: 'desktop',
      severity: 'critical',
      processType: 'renderer',
      message: typeof payload?.message === 'string' ? payload.message : 'Unknown renderer error',
      stack: typeof payload?.stack === 'string' ? payload.stack : undefined,
    });
  });

  // The Desktop Execution Engine's pipeline, one IPC call per stage — lets
  // the conversation layer collect missing info and narrate naturally
  // without duplicating any plugin's own logic.
  ipcMain.handle('action:checkRequirements', (_evt, request: ActionRequest) => desktopExecutionEngine.requirements(request));
  ipcMain.handle('action:describe', (_evt, request: ActionRequest) => desktopExecutionEngine.describeInProgress(request));
  ipcMain.handle('action:execute', (evt, request: ActionRequest) =>
    desktopExecutionEngine.execute(request, { pooledUsageRecorder: createRendererOrganizationUsageRecorder(evt.sender) })
  );
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
    if ('startWithWindows' in partial) {
      app.setLoginItemSettings({ openAtLogin: state.startWithWindows, path: app.getPath('exe') });
    }
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
        openUrl: 'https://pawos.revantaai.com',
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

  // "Upgrade" is always a real, billed subscription change — it belongs in the
  // Dashboard's own Billing/Upgrade page, never in the companion overlay's local
  // Coding/Infrastructure mode preference panel. Focuses the main window and asks
  // its own renderer to navigate there.
  ipcMain.on('ui:open-upgrade', () => {
    const win = opts.mainWindowProvider();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('ui:navigate-upgrade');
  });

  // Lets the overlay's own renderer slide itself across the desktop for the
  // idle "walk around" behavior — only the overlay window (never the main
  // dashboard) can be moved this way, and only ever within the primary
  // display's work area (clamped below).
  ipcMain.handle('overlay:moveWindow', (_evt, x: number, y: number) => {
    const win = opts.overlayWindowProvider();
    if (!win) return false;
    // The animation/idle-behavior controllers compute x/y from live window-bounds math (walk
    // interpolation, peek offsets, dock targets) — a stale or momentarily-null bounds read upstream
    // can produce NaN/undefined, which Electron's setPosition() throws on (uncaught, since this is
    // a fire-and-forget `void` call on the renderer side). Reject non-finite input here rather than
    // letting every caller re-validate its own math.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
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

  // This device's own local identity — see src/main/device/DeviceIdentityStore.ts.
  ipcMain.handle('device:getLocalIdentity', () => deviceIdentityStore.getIdentity());

  // Notification Runtime (MOB-7) — real Web Push send, see PushNotificationService.ts's
  // own header comment for why this runs here (main process) rather than a server.
  ipcMain.handle(
    'notifications:sendPush',
    (_evt, subscription: { endpoint: string; p256dh: string; authKey: string }, payload: PushNotificationPayload) =>
      pushNotificationService.send(subscription, payload)
  );

  // Account-level billing — subscription tier, pricing config, and AI
  // credit tracking. See src/main/billing/*.ts. Distinct from
  // CodingModeStore's own local Coding Runtime Go/Pro toggle.
  ipcMain.handle('billing:getPricing', () => pricingConfigStore.get());
  // Ticket Balance top-up presets/minimum — editable data (see
  // TicketPricingConfigStore.ts), never a code constant a UI hardcodes, so
  // new preset amounts can be added later without a redeploy.
  ipcMain.handle('billing:getTicketPricingConfig', () => ticketPricingConfigStore.get());
  ipcMain.handle('billing:getSubscription', () => subscriptionStore.getEffective());
  // P0-3: reject any string that isn't a real tier id — defense in depth (this path was already
  // non-exploitable on its own since status stays 'none' here, but "arbitrary tier strings rejected"
  // is an explicit audit requirement).
  const VALID_SUBSCRIPTION_TIERS: SubscriptionTierId[] = ['go', 'pro', 'proMax', 'team', 'enterprise'];
  ipcMain.handle('billing:setSubscriptionTier', (_evt, tier: SubscriptionTierId) => {
    if (!VALID_SUBSCRIPTION_TIERS.includes(tier)) throw new Error(`Unknown subscription tier: ${String(tier)}`);
    return subscriptionStore.setTier(tier);
  });
  // P0-3 security fix: previously trusted `orgTier` directly from the renderer with zero
  // verification — any code running in the renderer could call this with orgTier:'enterprise' and
  // instantly self-elevate (syncFromOrganization sets status:'active'). Now requires the caller's
  // own Supabase access token + a real organizationId, and independently re-derives the tier from
  // Supabase itself (real active membership + the organization's own tier column) before ever
  // calling the store — see OrganizationTierVerification.ts.
  ipcMain.handle('billing:syncFromOrganization', async (_evt, accessToken: string, organizationId: string, seatTier?: SeatTier) => {
    const verified = await verifyRealOrganizationTier(accessToken, organizationId);
    if (!verified.ok) throw new Error(verified.reason);
    return subscriptionStore.syncFromOrganization(verified.tier, seatTier);
  });
  ipcMain.handle('billing:reconcileForAccount', (_evt, accountId: string) => subscriptionStore.reconcileForAccount(accountId));
  // Called on sign-out so a stale, org-elevated tier from a previous account on this device never
  // carries over to the next account that signs in — see SubscriptionStore.reset()'s own comment.
  ipcMain.handle('billing:resetSubscription', () => subscriptionStore.reset());
  ipcMain.handle('billing:getCreditBalance', () => ({ ...creditStore.getBalance(), limit: entitlementService.getCreditLimit() }));
  ipcMain.handle('billing:consumeCredit', (_evt, amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) => {
    creditStore.consume(amount, reason, category, pawModelId === 'paw-fable');
    return { ...creditStore.getBalance(), limit: entitlementService.getCreditLimit() };
  });
  /**
   * Rolling-window gate for new billable Gemini generations — the authoritative main-process check
   * before any Gemini call starts. The renderer calls this before dispatching a turn; the result is
   * computed entirely from main-process state (UsageEventStore + PawComputeCapacityStore +
   * SubscriptionStore) — the renderer cannot supply tier, usage, limit, or the authorization result
   * itself. Pooled (Enterprise) tiers always return allowed=true locally; callers must go through
   * organizationUsageService for the real server-side pool check.
   */
  ipcMain.handle('billing:canStartGeneration', (_evt, pawModelId?: PawModelId) => {
    if (pawModelId === 'paw-fable') {
      const remaining = entitlementService.getFableCreditsRemaining();
      return { allowed: remaining > 0, reason: remaining > 0 ? undefined : 'Paw Fable credits exhausted' };
    }
    const tier = entitlementService.getEntitlements().tier;
    const seatTier = entitlementService.getSeatTier();
    const result = rollingUsageGate.canStartGeneration(tier, seatTier);
    // Reserve an in-flight slot atomically (Node.js single-threaded — no race between the check
    // above and the reserve here). Released by billing:recordTurnUsage or auto-released on timeout.
    if (result.allowed && !result.pooled) {
      rollingUsageGate.reserveSlot();
    }
    return result;
  });
  /**
   * Records real Gemini usage for one completed turn. The renderer sends only raw, provider-reported
   * usage — this handler is the ONLY place that turns real token counts into Paw Compute (via
   * UsageMeteringEngine) and the only place that calls creditStore.consume() for history/Fable
   * tracking. The rolling-window gate (billing:canStartGeneration / hasCreditsRemaining) reads from
   * UsageEventStore directly and is unaffected by creditStore's counters, which are now kept only
   * for history and Fable attribution. Fable turns are marked fable=true so rolling windows exclude
   * them (see RollingUsageGate.ts / NormalizedUsageRecord.fable).
   */
  ipcMain.handle(
    'billing:recordTurnUsage',
    (_evt, submission: TurnUsageSubmission, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) => {
      const isFable = pawModelId === 'paw-fable';
      // Release the in-flight slot reserved by billing:canStartGeneration for non-Fable, non-pooled
      // turns. Fable turns gate on purchased-credit headroom and never reserve a rolling-window slot;
      // pooled (Enterprise) turns go through organizationUsageService and also don't reserve one.
      if (!isFable && !entitlementService.isComputePooled()) {
        rollingUsageGate.releaseSlot();
      }
      const aggregated = recordTurnUsage(submission.requests, { sessionId: submission.sessionId, runId: submission.runId }, isFable);
      creditStore.consume(aggregated.totalNormalizedCompute, reason, category, isFable);
      return { aggregated, balance: { ...creditStore.getBalance(), limit: entitlementService.getCreditLimit() } };
    }
  );
  /**
   * Ledger-only usage reporting for a real Gemini request made from a renderer-side call site that
   * has no main-process equivalent (today: SessionClassifier.ts, which lives purely in the renderer
   * and so cannot import UsageMeteringEngine directly). Deliberately does NOT call
   * creditStore.consume() — this mirrors the already-established `backgroundTask` convention every
   * other non-conversation-turn Gemini call site in the main process already follows: the request is
   * durably recorded to UsageEventStore, but only billing:consumeCredit / billing:recordTurnUsage
   * ever charge. Idempotent on usage.requestId (see UsageMeteringEngine.recordUsageEvent).
   */
  ipcMain.handle(
    'billing:reportUsageEvent',
    (_evt, usage: ProviderUsageMetadata, requestType: UsageRequestType, context: { sessionId: string | null; runId: string | null }) =>
      recordUsageEvent(usage, requestType, context)
  );
  // Real, per-request usage ledger — the Usage Details view's data source (Model / Input / Output /
  // Total tokens / Paw Compute consumed, all real provider-reported values, never fabricated).
  ipcMain.handle('billing:getUsageEvents', (_evt, limit?: number) => usageEventStore.list(limit));
  // Real per-turn consumption history (up to 200 entries, see CreditStore.ts) — the Analytics
  // dashboard's usage breakdown/activity feed/insights are all derived from this, never fabricated.
  ipcMain.handle('billing:getCreditHistory', () => creditStore.getHistory());
  ipcMain.handle('billing:createCheckoutSession', (_evt, tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions) => {
    const provider = createBillingProvider(pricingConfigStore.get().billingProvider);
    return provider.createCheckoutSession(tier, callbackUrl, options);
  });
  ipcMain.handle(
    'billing:createNativeSubscriptionCheckout',
    async (_evt, tier: SubscriptionTierId, options?: CheckoutOptions): Promise<NativeSubscriptionCheckoutResult> => {
      if (!VALID_NATIVE_BILLING_TIERS.includes(tier) || tier === 'enterprise') {
        return {
          ok: false,
          reason:
            tier === 'enterprise'
              ? 'Enterprise billing is custom and must be handled by a PawOS billing administrator.'
              : 'Unknown paid plan requested.',
        };
      }
      try {
        const response = await fetch(`${PAWOS_BILLING_API_BASE_URL}/api/billing/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: tier,
            ...(options?.seatTier ? { seatTier: options.seatTier } : {}),
            ...(options?.seatCount ? { seatCount: options.seatCount } : {}),
            ...(options?.runtimeIds?.length ? { runtimeIds: options.runtimeIds } : {}),
          }),
        });
        const result = (await response.json().catch(() => null)) as
          | { ok?: boolean; reason?: string; keyId?: string; subscriptionId?: string }
          | null;
        if (!response.ok || !result?.ok || !result.keyId || !result.subscriptionId) {
          return { ok: false, reason: cleanReason(result, `Could not create checkout: ${response.statusText}`) };
        }
        return {
          ok: true,
          keyId: result.keyId,
          subscriptionId: result.subscriptionId,
          tier,
          seatTier: options?.seatTier,
          runtimeIds: options?.runtimeIds,
        };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Could not create checkout.' };
      }
    }
  );
  ipcMain.handle(
    'billing:confirmNativeSubscriptionPayment',
    async (
      _evt,
      paymentId: string,
      subscriptionId: string,
      signature: string
    ): Promise<{ ok: true; subscription: ReturnType<typeof subscriptionStore.getEffective> } | { ok: false; reason: string }> => {
      if (!paymentId || !subscriptionId || !signature) return { ok: false, reason: 'Missing Razorpay payment verification fields.' };
      const verified = await verifySubscriptionWithBackend(paymentId, subscriptionId, signature);
      if (!verified.ok) return { ok: false, reason: 'Payment could not be verified.' };
      subscriptionStore.confirmPurchase(verified.tier, {
        runtimeIds: parseVerifiedRuntimeIds(verified.runtimeIds),
        orderId: verified.subscriptionId,
      });
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('billing:subscriptionUpdated');
      return { ok: true, subscription: subscriptionStore.getEffective() };
    }
  );
  // Starts the loopback server the checkout page pings after a real payment
  // completes — see CheckoutSyncServer.ts for why this is the honest sync
  // mechanism available without a shared account/subscription backend.
  ipcMain.handle('billing:startCheckoutSync', () => startCheckoutCallbackServer());
  // Ticket Balance top-ups — a one-time Razorpay Order for an arbitrary
  // dollar amount, not a subscription-tier checkout, so it's a standalone
  // function rather than part of the BillingProvider interface (see
  // RazorpayBillingProvider.ts).
  // Trusted server-side gate (Go/Pro must never be able to create a real Ticket Balance top-up
  // order, even by invoking this IPC channel directly) — checked here, before RazorpayBillingProvider
  // is ever called, since Ticket Balance ('autonomousTaskBilling') is Pro Max/Team/Enterprise-only.
  ipcMain.handle(
    'billing:createCreditsCheckoutSession',
    (_evt, amountUsd: number, organizationId?: string, callbackUrl?: string, accessToken?: string) => {
      if (!entitlementService.isFeatureAvailable('autonomousTaskBilling')) {
        return { ok: false, reason: 'Ticket Balance requires Paw Pro Max or higher.' };
      }
      return createCreditsCheckoutUrl(amountUsd, organizationId, callbackUrl, accessToken);
    }
  );
  ipcMain.handle(
    'billing:createNativeCreditsCheckout',
    async (_evt, amountUsd: number, organizationId?: string, accessToken?: string): Promise<NativeCreditsCheckoutResult> => {
      if (!entitlementService.isFeatureAvailable('autonomousTaskBilling')) {
        return { ok: false, reason: 'Ticket Balance requires Paw Pro Max or higher.' };
      }
      if (!accessToken) return { ok: false, reason: 'Missing PawOS session. Sign in again before adding funds.' };
      try {
        const response = await fetch(`${PAWOS_BILLING_API_BASE_URL}/api/billing/checkout-credits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountUsd, organizationId, accessToken }),
        });
        const result = (await response.json().catch(() => null)) as
          | { ok?: boolean; reason?: string; keyId?: string; orderId?: string; amountUsd?: number; amountInr?: number; amountPaise?: number; usdInrRate?: number; currency?: string }
          | null;
        if (
          !response.ok ||
          !result?.ok ||
          !result.keyId ||
          !result.orderId ||
          typeof result.amountUsd !== 'number' ||
          typeof result.amountInr !== 'number' ||
          typeof result.amountPaise !== 'number' ||
          typeof result.usdInrRate !== 'number' ||
          result.currency !== 'INR'
        ) {
          return { ok: false, reason: cleanReason(result, `Could not create payment order: ${response.statusText}`) };
        }
        return {
          ok: true,
          keyId: result.keyId,
          orderId: result.orderId,
          amountUsd: result.amountUsd,
          amountInr: result.amountInr,
          amountPaise: result.amountPaise,
          usdInrRate: result.usdInrRate,
          currency: 'INR',
        };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Could not create payment order.' };
      }
    }
  );
  ipcMain.handle(
    'billing:verifyNativeCreditsPayment',
    async (
      _evt,
      params: { accessToken?: string; orderId?: string; paymentId?: string; signature?: string; organizationId?: string }
    ): Promise<NativeCreditsVerificationResult> => {
      if (!params.accessToken || !params.orderId || !params.paymentId || !params.signature) {
        return { ok: false, reason: 'Missing payment verification fields.' };
      }
      try {
        const response = await fetch(`${PAWOS_BILLING_API_BASE_URL}/api/billing/credit-ticket-balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: params.accessToken,
            orderId: params.orderId,
            paymentId: params.paymentId,
            signature: params.signature,
            organizationId: params.organizationId,
          }),
        });
        const result = (await response.json().catch(() => null)) as
          | { ok?: boolean; reason?: string; amountUsd?: number; topupId?: string }
          | null;
        if (!response.ok || !result?.ok || typeof result.amountUsd !== 'number') {
          return { ok: false, reason: cleanReason(result, `Payment could not be verified: ${response.statusText}`) };
        }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('billing:taskCreditsPurchased', { amountUsd: result.amountUsd, organizationId: params.organizationId });
        }
        return { ok: true, amountUsd: result.amountUsd, topupId: result.topupId };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'Payment verification failed.' };
      }
    }
  );
  // Grants bonus Paw Compute for the current period after the renderer has already redeemed the
  // matching dollar amount from the caller's Referral Credits balance via Supabase's
  // redeem_referral_credits_for_compute() RPC — this handler never touches money, it only ever
  // extends the local usage counter. See EntitlementService.grantComputeBonus()'s own doc comment.
  ipcMain.handle('billing:grantComputeBonus', (_evt, units: number) => {
    entitlementService.grantComputeBonus(units);
    return entitlementService.getSnapshot();
  });

  // Central entitlement queries — every runtime asks these instead of
  // hard-coding a tier check. See src/main/billing/EntitlementService.ts.
  ipcMain.handle('entitlement:getSnapshot', () => entitlementService.getSnapshot());
  ipcMain.handle('entitlement:isModelAvailable', (_evt, modelId: PawModelId) => entitlementService.isModelAvailable(modelId));
  ipcMain.handle('entitlement:isFeatureAvailable', (_evt, featureId: FeatureId) => entitlementService.isFeatureAvailable(featureId));
  ipcMain.handle('entitlement:getModelTierRequirements', () => entitlementService.getModelTierRequirements());
  ipcMain.handle('entitlement:getFeatureTierRequirements', () => entitlementService.getFeatureTierRequirements());

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
  // scoped to the 3D formats CompanionUploadPipeline.ts can load. Gated on
  // 'companionStudio' (Pro+) here, main-process side, per the product
  // decision that custom Companion upload is a paid-tier feature. This is
  // defense-in-depth for the native-picker entry point specifically; the
  // primary, single choke point covering both this AND drag-and-drop upload
  // is the entitlement check in CompanionLabSection.tsx's processUpload(),
  // which queries this same EntitlementService via entitlement:isFeatureAvailable.
  ipcMain.handle('companion:pickUploadFile', async (evt) => {
    if (!entitlementService.isFeatureAvailable('companionStudio')) return null;
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

  // Recording & Storage Foundation (Phase 1) — one real chunk appended to
  // durable storage per call, never a whole-recording payload; the
  // renderer's upload queue (CommunicationUploadQueue.ts) is what drives
  // retry/pause/resume on top of this single, stateless-per-call channel.
  ipcMain.handle(
    'communication:appendRecordingChunk',
    (_evt, communicationId: string, kind: 'audio' | 'video', base64Chunk: string, expectedChecksum?: string) =>
      communicationRuntime.appendRecordingChunk(communicationId, kind, base64Chunk, expectedChecksum)
  );
  ipcMain.handle('communication:finalizeRecording', (_evt, communicationId: string, kind: 'audio' | 'video', mimeType: string) =>
    communicationRuntime.finalizeRecording(communicationId, kind, mimeType)
  );
  // Internal-only — never surfaced in any end-user UI (Administrator Visibility requirement).
  ipcMain.handle('communication:getRecordingDiagnostics', (_evt, communicationId: string) => communicationRuntime.getRecordingDiagnostics(communicationId));
  // Real delete — removes the on-disk folder too, unlike the pre-Phase-1 store method it replaces at the user-facing level.
  ipcMain.handle('communication:deleteRecording', (_evt, communicationId: string) => communicationRuntime.deleteRecording(communicationId));
  // Timeline Indexing (Phase 2) — read-only, structural recording-lifecycle timeline for one session.
  ipcMain.handle('communication:getRecordingTimeline', (_evt, communicationId: string) => communicationRuntime.getRecordingTimeline(communicationId));
  // Foundation Intelligence (Phase 3A) — generates/reads immutable Evidence Objects for one finalized
  // recording. Never called from any recording/timeline lifecycle method — see CommunicationRuntime's
  // own doc comment on generateEvidence().
  ipcMain.handle('communication:generateEvidence', (_evt, communicationId: string, apiKey: string, model?: string, baseUrl?: string) =>
    communicationRuntime.generateEvidence(communicationId, apiKey, { model, baseUrl })
  );
  ipcMain.handle('communication:getEvidence', (_evt, communicationId: string) => communicationRuntime.getEvidence(communicationId));
  // Business Intelligence (Phase 3B) — interprets Phase 3A's Evidence Objects; never called from
  // any recording/timeline/evidence lifecycle method — see CommunicationRuntime's own doc comment
  // on generateBusinessInsights().
  ipcMain.handle('communication:generateBusinessInsights', (_evt, communicationId: string, apiKey: string, model?: string, baseUrl?: string) =>
    communicationRuntime.generateBusinessInsights(communicationId, apiKey, { model, baseUrl })
  );
  ipcMain.handle('communication:getBusinessInsights', (_evt, communicationId: string) => communicationRuntime.getBusinessInsights(communicationId));

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

  // Connectivity Runtime — see connectivityIpc.ts. Kept in its own
  // registration function (rather than inlined here like every feature
  // above) since every connectivity: handler shares one validation/response
  // wrapper; nothing about that changes how or when it's registered.
  registerConnectivityIpc();
}

