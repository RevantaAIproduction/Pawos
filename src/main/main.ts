import { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, session } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { createTray } from './tray/trayManager';
import { registerIpc } from './ipc/ipc';
import { SettingsStore } from '../shared/settings/SettingsStore';
import { readEnvFile } from './env/readEnvFile';
import { PUBLIC_ENV_DEFAULTS } from './env/publicEnvDefaults';
import { startForegroundWindowWatcher, getForegroundWindowInfo } from './system/ForegroundWindowWatcher';
import { startGoogleSignIn } from './auth/GoogleOAuthFlow';
import { waitForGitHubOAuthCallback } from './auth/GitHubOAuthFlow';
import { startMicrosoftSignIn, type MicrosoftOAuthConfig } from './auth/MicrosoftOAuthFlow';
import { handleOAuthProtocolUrl, extractProtocolUrlFromArgv } from './auth/OAuthProtocolBridge';
import { emailService } from './mail/EmailService';
import { getDevWindowIconPath } from './assets/AssetPathResolver';
import { conversationSessionStore } from './conversation/ConversationSessionStore';
import { communicationRuntime } from './communication/CommunicationRuntime';
import { workspaceMemoryStore } from './execution/WorkspaceMemoryStore';
import { dependencyGraphCache } from './execution/dependencyGraph/DependencyGraphCache';
import { repositorySemanticIndexStore } from './execution/semanticIndex/RepositorySemanticIndexStore';
import { languageProviderRegistry } from './execution/languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from './execution/languageProviders/TypeScriptLanguageProvider';
import { domainConceptRegistry } from './execution/domainIntelligence/DomainConceptRegistry';
import { BUILTIN_DOMAIN_CONCEPT_PACKS } from './execution/domainIntelligence/builtinConceptPacks';
import { errorMemoryStore } from './execution/ErrorMemoryStore';
import { executionMemoryStore } from './execution/ExecutionMemoryStore';
import { platformEventBus } from './platform/events/PlatformEventBus';
import { platformHealthStore } from './platform/health/PlatformHealthStore';
import { installPlatformCrashGuard } from './platform/health/PlatformCrashGuard';
import { startPlatformResourceSampler, stopPlatformResourceSampler } from './platform/health/PlatformResourceSampler';
import { trashStore } from './execution/plugins/recycleBin';
import { memoryGraphStore } from './memory/MemoryGraphStore';
import { observationEngine } from './memory/ObservationEngine';
import { browserPreferences } from './execution/browser/browserPreferences';
import { browserCapabilityStatus } from './execution/browser/browserCapabilityStatus';
import { codingModeStore } from './execution/CodingModeStore';
import { deviceIdentityStore } from './device/DeviceIdentityStore';
import { pricingConfigStore } from './billing/PricingConfigStore';
import { ticketPricingConfigStore } from './billing/TicketPricingConfigStore';
import { subscriptionStore } from './billing/SubscriptionStore';
import { creditStore } from './billing/CreditStore';
import { usageQuotaConfigStore } from './billing/UsageQuotaConfigStore';
import { usageStore } from './billing/UsageStore';
import { pawComputeConfigStore } from './billing/PawComputeConfigStore';
import { pawComputeCapacityStore } from './billing/PawComputeCapacityStore';
import { usageEventStore } from './billing/UsageEventStore';
import { onboardingStore } from './onboarding/OnboardingStore';
import { initInfrastructureConnectors } from './infrastructure/bootstrap';
import { requirementGate } from './runtime/RequirementGate';
import { capabilityRequirementResolver } from './connectivity/CapabilityRequirementResolver';
import { entitlementRequirementResolver } from './billing/EntitlementRequirementResolver';
import { engineeringMemoryStore } from './infrastructure/EngineeringMemoryStore';
import { infraModeStore } from './infrastructure/InfraModeStore';
import { provisionedInstanceStore } from './infrastructure/ProvisionedInstanceStore';
import { ratingPromptStore } from './feedback/RatingPromptStore';
import { feedbackStore } from './feedback/FeedbackStore';
import { helpActivityStore } from './help/HelpActivityStore';
import { supportConversationStore } from './help/SupportConversationStore';
import { discoveryService } from './connectivity/DiscoveryService';
import { connectorRegistry } from './connectivity/ConnectorRegistry';
import { jiraConnectorSDK } from './connectivity/connectors/JiraConnectorSDK';
import { googleWorkspaceConnectorSDK } from './connectivity/connectors/GoogleWorkspaceConnectorSDK';
import { gitHubConnectorSDK } from './connectivity/connectors/GitHubConnectorSDK';
import { gitLabConnectorSDK } from './connectivity/connectors/GitLabConnectorSDK';
import { linearConnectorSDK } from './connectivity/connectors/LinearConnectorSDK';
import { vercelConnectorSDK } from './connectivity/connectors/VercelConnectorSDK';
import { netlifyConnectorSDK } from './connectivity/connectors/NetlifyConnectorSDK';
import { railwayConnectorSDK } from './connectivity/connectors/RailwayConnectorSDK';
import { slackConnectorSDK } from './connectivity/connectors/SlackConnectorSDK';
import { microsoftConnectorSDK } from './connectivity/connectors/MicrosoftConnectorSDK';
import { startRatingPromptScheduler } from './feedback/RatingPromptScheduler';

console.error("[PAWOS START] main.ts loaded");

process.on("beforeExit", code => console.error("[PAWOS EXIT] beforeExit", code));
process.on("exit", code => console.error("[PAWOS EXIT] exit", code));
process.on("uncaughtException", error => console.error("[PAWOS ERROR] uncaughtException", error));
process.on("unhandledRejection", reason => console.error("[PAWOS ERROR] unhandledRejection", reason));

// One constant size, always — the overlay window itself never resizes at
// runtime. A native window resize inherently reads as "an application
// window resizing," which is exactly the feel the Workspace Runtime must
// avoid. This is sized generously enough to host the Workspace Runtime
// panel (which scrolls internally past ~360px, see taskCard.module.css)
// alongside the avatar/chat, but the window is mostly transparent and
// click-through (see setIgnoreMouseEvents below) — growing/shrinking what
// the user actually perceives happens entirely via CSS on content inside
// this unchanging canvas (app.module.css), never via setBounds(). Still
// primary-display-only — multi-monitor targeting is a future concern.
const MAIN_W = 1280;
const MAIN_H = 820;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let companionEnabled = false;
let envVars: Record<string, string> = {};

// Installed at module scope, before app.whenReady() and before any window
// exists — process.on('uncaughtException'/'unhandledRejection') can fire
// during this earliest startup window, and installing the guard any later
// would leave that window uncovered.
installPlatformCrashGuard();

// Real OAuth deep-link delivery (see OAuthProtocolBridge.ts): pawos-web's
// hosted /auth/google/callback and /auth/github/callback routes redirect the
// browser to pawos://google-auth-callback / pawos://github-auth-callback
// rather than relaying to a local port, since a remote server can't reach
// one on this machine. Registering as the pawos:// handler must happen
// before app.whenReady(). The unpackaged (`electron .`) form needs the exe
// path + script arg explicitly — Windows can't otherwise reconstruct how to
// relaunch a dev build from a protocol click.
if (process.defaultApp) {
  const scriptArg = process.argv[1];
  if (scriptArg) {
    app.setAsDefaultProtocolClient('pawos', process.execPath, [path.resolve(scriptArg)]);
  }
} else {
  app.setAsDefaultProtocolClient('pawos');
}

console.error("[PAWOS START] before app.whenReady");

// Windows/Linux deliver a protocol click as a brand-new process launch with
// the URL in argv — without a single-instance lock, that would open a
// second, redundant copy of PawOS instead of handing the URL to the one
// already running (and already holding the pending OAuth promise).
// Request single-instance lock. On failure, we'll proceed anyway since this could be:
// 1. A stale lock file from a crash
// 2. The user starting a second instance intentionally
// Better to launch and handle it than to silently quit.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
console.error("[PAWOS LOCK] gotSingleInstanceLock:", gotSingleInstanceLock);

if (gotSingleInstanceLock) {
  app.on('second-instance', (_event, argv) => {
    const url = extractProtocolUrlFromArgv(argv);
    if (url) handleOAuthProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
} else {
  console.error("[PAWOS LOCK] Could not acquire lock - another instance may be running, but proceeding anyway");
  // Don't quit - let the app run anyway. Worst case we have two instances, which is better than no instance.
}

// macOS delivers a protocol click via this event instead of argv/second-instance.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthProtocolUrl(url);
});

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
// Hardware acceleration is off (no GPU on this machine), so WebGL (used by
// the 3D companion avatar) falls back to software rendering. Chromium logs
// that automatic fallback as deprecated and asks for this flag explicitly.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

/**
 * Renderer console output and crashes are otherwise invisible from the main
 * process's own stdout, which made "the companion didn't appear" reports
 * impossible to diagnose — this makes the actual JS error (if any) show up
 * right here instead of silently vanishing.
 */
function attachDiagnostics(win: BrowserWindow, label: string) {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 1) console.log(`[${label} console L${level}]`, message, `(${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[${label} render-process-gone]`, details.reason);
    platformEventBus.reportRuntimeEvent({
      kind: 'crash',
      runtime: 'desktop',
      severity: 'critical',
      processType: 'renderer',
      message: `[${label}] renderer process gone: ${details.reason}`,
    });
  });
  win.webContents.on('unresponsive', () => {
    console.error(`[${label}] webContents became unresponsive`);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[${label} did-fail-load]`, errorCode, errorDescription);
  });
}

function getOverlayBoundsCentered() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // Window size: 75% width × full height, centered horizontally
  const windowWidth = Math.round(width * 0.75);
  const windowHeight = height;
  const x = Math.round((width - windowWidth) / 2);
  const y = 0;
  console.error('[OVERLAY] Creating window at:', { x, y, width: windowWidth, height: windowHeight });
  return { x, y, width: windowWidth, height: windowHeight };
}

/**
 * The desktop always remains the user's desktop: by default the overlay
 * ignores mouse events entirely (forward:true still delivers mousemove so
 * the renderer's own hover-detection knows when to call this again with
 * active:true) so its mostly-transparent bounds never block clicks meant
 * for whatever's underneath. Only turned off (interactive) while the
 * cursor is actually over a real, visible region (avatar/chat/workspace
 * panel) — see the mousemove-driven toggle in CompanionExperience.tsx.
 */
function setOverlayInteractive(active: boolean): boolean {
  if (!overlayWindow) return false;
  overlayWindow.setIgnoreMouseEvents(!active, { forward: true });
  return true;
}

function createMainWindow() {
  console.error("[PAWOS WINDOW] createMainWindow() called");
  const devIcon = getDevWindowIconPath();
  mainWindow = new BrowserWindow({
    width: MAIN_W,
    height: MAIN_H,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#08080a',
    ...(devIcon ? { icon: devIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  console.error("[PAWOS WINDOW] BrowserWindow constructor completed");
  attachDiagnostics(mainWindow, 'main');
  console.error("[PAWOS WINDOW] before loadURL");
  mainWindow.loadURL(`${pathToFileURL(path.join(__dirname, '../renderer/index.html')).href}?window=main`);
  console.error("[PAWOS WINDOW] after loadURL");

  mainWindow.once('ready-to-show', () => {
    console.error("[PAWOS WINDOW] ready-to-show fired");
    mainWindow?.show();
    mainWindow?.webContents.openDevTools();
    console.error("[PAWOS WINDOW] window shown");
  });

  mainWindow.on('closed', () => {
    console.error("[PAWOS WINDOW] closed event fired");
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error("[PAWOS WINDOW] did-fail-load", errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', () => {
    console.error("[PAWOS WINDOW] renderer crashed");
  });

  console.error("[PAWOS WINDOW] createMainWindow() complete");
}

function createOverlayWindow() {
  const bounds = getOverlayBoundsCentered();
  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  attachDiagnostics(overlayWindow, 'companion');
  overlayWindow.loadURL(`${pathToFileURL(path.join(__dirname, '../renderer/index.html')).href}?window=companion`);

  // Click-through by default (see setOverlayInteractive) — the transparent
  // canvas must never block the real desktop underneath until the
  // renderer reports the cursor is actually over visible content.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    companionEnabled = false;
  });

  registerOverlayDragBehavior();
}

function enableCompanion() {
  companionEnabled = true;
  if (!overlayWindow) {
    createOverlayWindow();
  } else {
    overlayWindow.show();
  }
}

function disableCompanion() {
  companionEnabled = false;
  overlayWindow?.hide();
}

function registerOverlayDragBehavior() {
  if (!overlayWindow) return;

  // Draggable overlay: renderer handles drag interactions and tells us when to temporarily disable click-through.
  ipcMain.on('overlay:request-focus', () => {
    // no-op placeholder for future focus mgmt
  });
}

function createAppTray() {
  tray = createTray({
    app,
    onToggleVisibility: () => {
      if (!overlayWindow) {
        enableCompanion();
      } else if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    },
    onShow: () => enableCompanion(),
    onHide: () => overlayWindow?.hide(),
    onRestart: () => {
      app.relaunch();
      app.exit(0);
    },
    onExit: () => app.exit(0),
    onChangePet: () => {
      overlayWindow?.webContents.send('ui:open-settings');
    },
    onOpenSettings: () => overlayWindow?.webContents.send('ui:open-settings'),
    onOpenDashboard: () => {
      if (!mainWindow) createMainWindow();
      else mainWindow.show();
    },
  });
}

app.whenReady().then(async () => {
  console.error("[PAWOS START] app.whenReady entered");
  // Electron auto-generates a default File/Edit/View/Window/Help menu bar when no
  // application menu is set — that's stock OS chrome, not anything this product defines, and
  // doesn't belong on a companion app with no File/Edit/View/Window/Help commands to offer. Null
  // removes it entirely rather than building a custom one with nothing real to put in it.
  Menu.setApplicationMenu(null);
  console.error("[PAWOS START] before startup initialization");

  // Cold start via a pawos:// click (app wasn't already running): Windows/
  // Linux launch this as a brand-new process with the URL in argv, but that
  // never fires 'second-instance' (nothing was running to receive it) — only
  // this process's own process.argv has it.
  const coldStartUrl = extractProtocolUrlFromArgv(process.argv);
  if (coldStartUrl) handleOAuthProtocolUrl(coldStartUrl);

  // Without an explicit handler, Electron denies 'media' (microphone)
  // permission requests by default for file://-loaded content — which is
  // how every window here loads. That silently breaks SpeechRecognition
  // before any audio is ever captured (recognition.start() fails
  // immediately with a 'not-allowed' error). 'notifications' must also be
  // allowed here — the onboarding wizard's "Enable notifications" step
  // calls the real Notification.requestPermission() API, and this handler
  // used to blanket-deny anything other than 'media', so that step always
  // silently resolved to 'denied' with no real OS prompt ever shown.
  const ALLOWED_PERMISSIONS = new Set(['media', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission));

  // Ensure settings store initialized (creates file on first run)
  SettingsStore.init();

  // Electron's memory of every conversation — rooted at userData, unlike
  // SettingsStore above (which writes to cwd, a pre-existing gap left as-is
  // here since fixing it is unrelated to this feature).
  conversationSessionStore.init();
  workspaceMemoryStore.init();
  dependencyGraphCache.init();
  repositorySemanticIndexStore.init();
  errorMemoryStore.init();
  executionMemoryStore.init();
  platformHealthStore.init();
  startPlatformResourceSampler();
  trashStore.init();
  memoryGraphStore.init();
  observationEngine.init();
  browserPreferences.init();
  browserCapabilityStatus.init();
  codingModeStore.init();
  communicationRuntime.init();
  deviceIdentityStore.init();
  pricingConfigStore.init();
  ticketPricingConfigStore.init();
  subscriptionStore.init();
  creditStore.init();
  usageQuotaConfigStore.init();
  usageStore.init();
  pawComputeConfigStore.init();
  pawComputeCapacityStore.init();
  usageEventStore.init();
  onboardingStore.init();
  engineeringMemoryStore.init();
  infraModeStore.init();
  provisionedInstanceStore.init();
  ratingPromptStore.init();
  feedbackStore.init();
  helpActivityStore.init();
  supportConversationStore.init();

  // Connectivity Runtime — populates the registry with real, locally-
  // detected tools (Git, Docker, kubectl, VS Code, etc.) so the
  // Integrations Settings page has real data from first launch, not an
  // always-empty "Detected on this machine" section.
  discoveryService.discoverAndRegister().catch((e) => console.error('[connectivity] discoverAndRegister failed:', e));

  // Connector #1: Jira — the first real ConnectorSDK, bridging this previously-empty registry
  // into the Infrastructure Runtime that InvestigateTicketPlugin actually reads from.
  connectorRegistry.register(jiraConnectorSDK);

  // Connector #2: Google Workspace — first OAuth2/PKCE ConnectorSDK, bridging Drive/Gmail/
  // Calendar/Contacts into the pre-existing officeConnectorRegistry scaffold (OFF-1).
  connectorRegistry.register(googleWorkspaceConnectorSDK);

  // Connectors #3-#9: GitHub/GitLab/Linear/Vercel/Netlify/Railway/Slack — every remaining PawOS
  // v1 Connections provider. Signed-in credential persistence is restored by the renderer after
  // it confirms an authenticated Supabase session.
  const oauthConnectorSDKs = [
    gitHubConnectorSDK,
    gitLabConnectorSDK,
    linearConnectorSDK,
    vercelConnectorSDK,
    netlifyConnectorSDK,
    railwayConnectorSDK,
    slackConnectorSDK,
    microsoftConnectorSDK,
  ] as const;
  for (const sdk of oauthConnectorSDKs) {
    connectorRegistry.register(sdk);
  }

  // .env next to the installed exe (packaged) or at the repo root (dev
  // checkout, cwd when running `electron .`) — lets the user drop keys in a
  // file instead of typing them into the app. PUBLIC_ENV_DEFAULTS covers the
  // non-secret OAuth/Supabase config every install needs (see its own
  // comments for why these specific values are safe to ship); a real .env
  // still overrides them for anyone pointing at a different backend.
  envVars = { ...PUBLIC_ENV_DEFAULTS, ...readEnvFile([path.dirname(app.getPath('exe')), process.cwd(), app.getAppPath()]) };

  // Real bug fix, not a redesign: readEnvFile() only ever returned a plain object — nothing
  // anywhere copied it into process.env. Every process.env[...] lookup elsewhere in the app
  // (OAuthManager's clientIdEnvVar, WebhookManager's CONNECTIVITY_PUBLIC_BASE_URL_ENV_VAR,
  // communication adapters' credentialEnvVar) was silently unreachable via the app's own .env
  // file convention — it only worked if the value happened to already be a real OS-level
  // environment variable. This was latent/never-hit until GoogleWorkspaceConnectorSDK became the
  // first registered connector to actually declare an `oauth.clientIdEnvVar`. `.env` file values
  // win over whatever the OS process already had, matching this object's own existing precedence
  // (PUBLIC_ENV_DEFAULTS < .env file).
  Object.assign(process.env, envVars);

  if (envVars.SMTP_HOST && envVars.SMTP_USER && envVars.SMTP_PASS && envVars.EMAIL_FROM) {
    emailService.init({
      host: envVars.SMTP_HOST,
      port: Number(envVars.SMTP_PORT) || 587,
      secure: envVars.SMTP_SECURE === 'true',
      user: envVars.SMTP_USER,
      pass: envVars.SMTP_PASS,
      from: envVars.EMAIL_FROM,
    });
  }

  initInfrastructureConnectors(envVars);

  // RequirementGate — the runtime's general requirement-resolution engine. Two resolvers exist
  // today (capability access, checked against the Infrastructure/Connectivity Runtime registries
  // above; entitlement access, checked against the subscription tier); future resolver kinds
  // (confirmation/approval/selection/etc.) register here the same way.
  requirementGate.registerResolver(capabilityRequirementResolver);
  requirementGate.registerResolver(entitlementRequirementResolver);

  // Language Provider Registry — the seam DependencyGraphBuilder/FeatureMapBuilder call through
  // instead of hardcoding TypeScript's compiler API directly. TypeScript is the only registered
  // provider today; a future language is a new registerProvider() call here, nothing else.
  languageProviderRegistry.registerProvider(typeScriptLanguageProvider);

  // Domain Concept Registry — the seam DetectDomainConceptsPlugin calls through instead of
  // hardcoding a fixed vocabulary list. Three built-in packs (auth/billing/crudResource) today; a
  // future pack (e.g. notifications, search) is a new registerPack() call here, nothing else.
  for (const pack of BUILTIN_DOMAIN_CONCEPT_PACKS) domainConceptRegistry.registerPack(pack);

  console.error("[PAWOS START] after startup initialization");
  console.error("[PAWOS START] before BrowserWindow creation");
  createMainWindow();
  console.error("[PAWOS START] BrowserWindow created");
  console.error("[PAWOS START] before tray creation");
  createAppTray();
  console.error("[PAWOS START] tray creation complete");
  startForegroundWindowWatcher();
  startRatingPromptScheduler(() => mainWindow);
  registerIpc({
    app,
    overlayWindowProvider: () => overlayWindow,
    mainWindowProvider: () => mainWindow,
    getScreenWorkArea: () => screen.getPrimaryDisplay().workAreaSize,
    setOverlayInteractive,
    enableCompanion,
    disableCompanion,
    isCompanionEnabled: () => companionEnabled,
    getEnvApiKeys: () => ({
      gemini: envVars.GEMINI_API_KEY,
      supabaseUrl: envVars.SUPABASE_URL,
      supabasePublishableKey: envVars.SUPABASE_PUBLISHABLE_KEY,
      githubRedirectUri: envVars.GITHUB_REDIRECT_URI,
    }),
    getForegroundWindowInfo,
    getEmailSigningSecret: () => envVars.EMAIL_SIGNING_SECRET,
    isGoogleSignInConfigured: () => Boolean(envVars.GOOGLE_CLIENT_ID && envVars.GOOGLE_REDIRECT_URI),
    startGoogleSignIn: () => {
      if (!envVars.GOOGLE_CLIENT_ID || !envVars.GOOGLE_REDIRECT_URI) {
        return Promise.reject(
          new Error('Google sign-in isn’t configured yet — add GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI to your .env.')
        );
      }
      return startGoogleSignIn({
        clientId: envVars.GOOGLE_CLIENT_ID,
        redirectUri: envVars.GOOGLE_REDIRECT_URI,
      });
    },
    // GitHub sign-in goes through Supabase's own hosted OAuth (GitHub's
    // OAuth2 has no id_token to bridge with, unlike Google) — see
    // GitHubOAuthFlow.ts. The renderer builds the authorize URL via
    // supabase.auth.signInWithOAuth() and hands it here; this only needs
    // GITHUB_REDIRECT_URI (the loopback callback), since the Client
    // ID/Secret live in the Supabase project's provider settings, not here.
    isGithubSignInConfigured: () => Boolean(envVars.GITHUB_REDIRECT_URI),
    startGithubSignIn: (authorizeUrl: string) => {
      if (!envVars.GITHUB_REDIRECT_URI) {
        return Promise.reject(
          new Error("GitHub sign-in isn’t configured yet - add GITHUB_REDIRECT_URI to your .env.")
        );
      }
      return waitForGitHubOAuthCallback(envVars.GITHUB_REDIRECT_URI, authorizeUrl);
    },
    isMicrosoftSignInConfigured: () => Boolean(envVars.MICROSOFT_CLIENT_ID && envVars.MICROSOFT_CLIENT_SECRET && envVars.MICROSOFT_TENANT_ID),
    startMicrosoftSignIn: () => {
      if (!envVars.MICROSOFT_CLIENT_ID || !envVars.MICROSOFT_CLIENT_SECRET || !envVars.MICROSOFT_TENANT_ID || !envVars.MICROSOFT_REDIRECT_URI) {
        return Promise.reject(new Error("Microsoft sign-in not configured"));
      }
      return startMicrosoftSignIn({
        clientId: envVars.MICROSOFT_CLIENT_ID,
        redirectUri: envVars.MICROSOFT_REDIRECT_URI,
        tenantId: envVars.MICROSOFT_TENANT_ID,
      });
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  console.error("[PAWOS START] startup complete");
});

console.error("[PAWOS START] window-all-closed handler set up");

app.on('window-all-closed', () => {
  console.error("[PAWOS WINDOW] window-all-closed event fired");
  // keep running background via tray
});

// Global shortcuts are handled in renderer via input hooks (per requirements), but we keep an escape hatch here.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopPlatformResourceSampler();
});

// Auto start with Windows — reflects the persisted Settings > General toggle
// (GeneralSection.tsx's startWithWindows), not a hardcoded always-on default.
// electron-builder.yml config uses nsis; also set in main for immediate behavior.
app.setLoginItemSettings({
  openAtLogin: SettingsStore.getState().startWithWindows,
  path: app.getPath('exe'),
});
