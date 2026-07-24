import { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, session } from 'electron';
import * as path from 'path';
import { createTray } from './tray/trayManager';
import { registerIpc } from './ipc/ipc';
import { SettingsStore } from '../shared/settings/SettingsStore';
import { readEnvFile } from './env/readEnvFile';
import { startForegroundWindowWatcher, getForegroundWindowInfo } from './system/ForegroundWindowWatcher';
import { startGoogleSignIn } from './auth/GoogleOAuthFlow';
import { emailService } from './mail/EmailService';
import { getDevWindowIconPath } from './assets/AssetPathResolver';
import { conversationSessionStore } from './conversation/ConversationSessionStore';
import { communicationRuntime } from './communication/CommunicationRuntime';
import { workspaceMemoryStore } from './execution/WorkspaceMemoryStore';
import { errorMemoryStore } from './execution/ErrorMemoryStore';
import { executionMemoryStore } from './execution/ExecutionMemoryStore';
import { trashStore } from './execution/plugins/recycleBin';
import { memoryGraphStore } from './memory/MemoryGraphStore';
import { observationEngine } from './memory/ObservationEngine';
import { browserPreferences } from './execution/browser/browserPreferences';
import { browserCapabilityStatus } from './execution/browser/browserCapabilityStatus';
import { codingModeStore } from './execution/CodingModeStore';
import { platformPairingStore } from './pairing/PlatformPairingStore';
import { deviceIdentityStore } from './device/DeviceIdentityStore';
import { pricingConfigStore } from './billing/PricingConfigStore';
import { subscriptionStore } from './billing/SubscriptionStore';
import { creditStore } from './billing/CreditStore';
import { onboardingStore } from './onboarding/OnboardingStore';
import { initInfrastructureConnectors } from './infrastructure/bootstrap';
import { engineeringMemoryStore } from './infrastructure/EngineeringMemoryStore';
import { infraModeStore } from './infrastructure/InfraModeStore';
import { provisionedInstanceStore } from './infrastructure/ProvisionedInstanceStore';
import { ratingPromptStore } from './feedback/RatingPromptStore';
import { feedbackStore } from './feedback/FeedbackStore';
import { helpActivityStore } from './help/HelpActivityStore';
import { supportConversationStore } from './help/SupportConversationStore';
import { startRatingPromptScheduler } from './feedback/RatingPromptScheduler';
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
const OVERLAY_W = 820;
const OVERLAY_H = 520;
const MAIN_W = 1280;
const MAIN_H = 820;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let companionEnabled = false;
let envVars: Record<string, string> = {};

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
// Hardware acceleration is off (no GPU on this machine), so WebGL (used by
// the 3D companion avatar) falls back to software rendering. Chromium logs
// that automatic fallback as deprecated and asks for this flag explicitly.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

function getOverlayBoundsCentered() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((width - OVERLAY_W) / 2);
  const y = Math.round((height - OVERLAY_H) / 2);
  return { x, y, width: OVERLAY_W, height: OVERLAY_H };
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

  mainWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}?window=main`);

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  overlayWindow.loadURL(`file://${path.join(__dirname, '../renderer/index.html')}?window=companion`);

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
  // Without an explicit handler, Electron denies 'media' (microphone)
  // permission requests by default for file://-loaded content — which is
  // how every window here loads. That silently breaks SpeechRecognition
  // before any audio is ever captured (recognition.start() fails
  // immediately with a 'not-allowed' error). This app only ever asks for
  // microphone access (voice input) — nothing else needs granting.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');

  // Ensure settings store initialized (creates file on first run)
  SettingsStore.init();

  // Electron's memory of every conversation — rooted at userData, unlike
  // SettingsStore above (which writes to cwd, a pre-existing gap left as-is
  // here since fixing it is unrelated to this feature).
  conversationSessionStore.init();
  workspaceMemoryStore.init();
  errorMemoryStore.init();
  executionMemoryStore.init();
  trashStore.init();
  memoryGraphStore.init();
  observationEngine.init();
  browserPreferences.init();
  browserCapabilityStatus.init();
  codingModeStore.init();
  communicationRuntime.init();
  platformPairingStore.init();
  deviceIdentityStore.init();
  pricingConfigStore.init();
  subscriptionStore.init();
  creditStore.init();
  onboardingStore.init();
  engineeringMemoryStore.init();
  infraModeStore.init();
  provisionedInstanceStore.init();
  ratingPromptStore.init();
  feedbackStore.init();
  helpActivityStore.init();
  supportConversationStore.init();

  // .env next to the installed exe (packaged) or at the repo root (dev
  // checkout, cwd when running `electron .`) — lets the user drop keys in a
  // file instead of typing them into the app.
  envVars = readEnvFile([path.dirname(app.getPath('exe')), process.cwd(), app.getAppPath()]);

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

  createMainWindow();
  createAppTray();
  startForegroundWindowWatcher();
  startRatingPromptScheduler(() => mainWindow);
  registerIpc({
    app,
    overlayWindowProvider: () => overlayWindow,
    getScreenWorkArea: () => screen.getPrimaryDisplay().workAreaSize,
    setOverlayInteractive,
    enableCompanion,
    disableCompanion,
    isCompanionEnabled: () => companionEnabled,
    getEnvApiKeys: () => ({
      gemini: envVars.GEMINI_API_KEY,
      supabaseUrl: envVars.SUPABASE_URL,
      supabasePublishableKey: envVars.SUPABASE_PUBLISHABLE_KEY,
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
        clientSecret: envVars.GOOGLE_CLIENT_SECRET,
        redirectUri: envVars.GOOGLE_REDIRECT_URI,
      });
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // keep running background via tray
});

// Global shortcuts are handled in renderer via input hooks (per requirements), but we keep an escape hatch here.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Auto start with Windows
// electron-builder.yml config uses nsis; also set in main for immediate behavior.
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe'),
});
