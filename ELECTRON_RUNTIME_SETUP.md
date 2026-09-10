# ELECTRON RUNTIME SETUP ANALYSIS

**Date**: 2026-09-09
**Purpose**: Determine minimum requirements to launch interactive PawOS Electron app

---

## A. EXISTING ELECTRON LAUNCH COMMAND

```bash
npm run dev:electron
```

**What it does**: `electron .`
- Launches Electron
- Loads main process from `dist/main/main.js`
- Loads renderer from `dist/renderer/index.html` (via file:// URL)
- Opens DevTools by default (line 245 of main.ts: `mainWindow?.webContents.openDevTools()`)

---

## B. REQUIRED ENVIRONMENT VARIABLES

**Source**: `src/main/env/publicEnvDefaults.ts`

### Non-Secret Defaults (Already Embedded in App)

```
GOOGLE_CLIENT_ID: 1047116528874-q7uh6289u1h56nogu7pv1mf1eh67q7k5.apps.googleusercontent.com
GOOGLE_REDIRECT_URI: https://pawos.revantaai.com/auth/google/callback
GITHUB_REDIRECT_URI: https://pawos.revantaai.com/auth/github/callback
MICROSOFT_REDIRECT_URI: https://pawos.revantaai.com/auth/microsoft/callback
SUPABASE_URL: https://krqdxdguqaoehrxhmggz.supabase.co
SUPABASE_PUBLISHABLE_KEY: sb_publishable_E3vh2q3V3Sj-h7TY341D6Q_EmEneDwQ
CONNECTOR_GITHUB_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/github/callback
LINEAR_REDIRECT_URL: https://pawos.revantaai.com/api/connectors/linear/callback
CONNECTOR_JIRA_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/jira/callback
CONNECTOR_SLACK_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/slack/callback
CONNECTOR_MICROSOFT_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/microsoft/callback
CONNECTOR_VERCEL_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/vercel/callback
CONNECTOR_NETLIFY_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/netlify/callback
CONNECTOR_RAILWAY_CALLBACK_URL: https://pawos.revantaai.com/api/connectors/railway/callback
```

**Can be overridden**: Create `.env` file in project root (readEnvFile checks `app.getPath('userData')` and repo root)

### Secrets (NOT embedded — must provide if using live OAuth)

- **Not required for basic launch** (staging Supabase will redirect to server-side auth)
- Only needed if testing actual OAuth redirects

---

## C. REQUIRED BACKEND/DEV-SERVER PROCESSES

### For Production Build (Current State)

**Minimum**: Just Electron
- Renderer is already built (`dist/renderer/index.html` exists — Sep 6 12:24)
- Main is already built (`dist/main/main.js` exists — Sep 9 04:28)
- Preload is already built (`dist/preload/preload.js` exists — Sep 6 12:23)

**Command**: 
```bash
npm run dev:electron
```
or simply:
```bash
electron .
```

### For Development with Hot Reload

**Two processes required**:
1. Webpack dev server (renderer): `npm run dev:renderer` (port 3000, writes to disk)
2. Electron: `npm run dev:electron`

**Combined**:
```bash
npm run dev
```
(This runs both concurrently via npm/concurrently)

### For Development Without Hot Reload

**Two-step**:
1. Rebuild: `npm run build:renderer`
2. Launch: `npm run dev:electron`

---

## D. REQUIRED PORTS

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| webpack-dev-server (renderer) | 3000 | Hot reload (optional) | Not needed for current build |
| Supabase (remote) | 443 (HTTPS) | Auth + billing state | Already accessible |
| Gemini API (remote) | 443 (HTTPS) | Model inference | Already accessible |
| OAuth providers (remote) | 443 (HTTPS) | GitHub, Google, Jira, Linear, Slack | Already accessible |
| Stripe (remote) | 443 (HTTPS) | Payment processing | Already accessible |

**Local ports required**: NONE (all served via HTTPS from remote)

---

## E. RENDERER LOADING PATH

**Current (Production Build)**:

```typescript
// From src/main/main.ts, line 239:
mainWindow.loadURL(
  `${pathToFileURL(path.join(__dirname, '../renderer/index.html')).href}?window=main`
)
```

**Expands to**:
```
file:///C:/Users/APPLE/Downloads/PawOS/dist/renderer/index.html?window=main
file:///C:/Users/APPLE/Downloads/PawOS/dist/renderer/index.html?window=companion
```

**Structure**:
- `dist/renderer/index.html` — entry point
- `dist/renderer/renderer.js` — bundled React/TypeScript
- `dist/renderer/images/` — static assets
- `/core`, `/main`, `/renderer`, `/shared/` — bundled modules

**No web server needed** — loads directly from filesystem

---

## F. EXISTING AUTOMATED ELECTRON TEST CAPABILITY

**Test Framework**: Vitest
**Command**: `npm test`

**Current test count**: 380 test files

**Availability**: Test files exist but require test environment setup

**For P0 tests**: 
- NO automated Electron/E2E test harness found in package.json
- Would require Puppeteer, Playwright, or Electron WebDriver
- Must be added separately (out of scope)

---

## G. WHETHER CURRENT ENVIRONMENT CAN LAUNCH ELECTRON

**Assessment**: ❌ **CANNOT LAUNCH ELECTRON IN THIS CLI-ONLY ENVIRONMENT**

**Reason**:
1. Electron requires interactive graphics (X11, Wayland, or Windows GUI)
2. Current session is non-interactive CLI (no DISPLAY, no desktop)
3. `npm run dev:electron` attempts to create BrowserWindows, which requires:
   - Graphics server (Windows: native GUI)
   - Mouse/keyboard input device
   - Display capable of rendering 3D canvas (for Companion avatar)

**What happens if we try**:
```bash
$ npm run dev:electron
[PAWOS START] main.ts loaded
[PAWOS START] before app.whenReady
[PAWOS LOCK] gotSingleInstanceLock: true
# ... hangs or crashes waiting for graphics environment
```

**To verify**: Electron would fail with error like:
- "DISPLAY not set" (Linux)
- "Cannot create window in headless environment" (Windows)
- or hang indefinitely waiting for GPU

---

## H. EXACT COMMAND SEQUENCE FOR LOCAL LAUNCH

**For local developer machine with interactive desktop**:

### Option 1: Fast Launch (Current Build)
```bash
cd C:\Users\APPLE\Downloads\PawOS
npm run dev:electron
```

**What happens**:
1. Electron starts
2. Main window opens (1280x820)
3. Loads `dist/renderer/index.html`
4. DevTools opens automatically
5. Sign-in page appears
6. User can sign up/sign in

**Estimated startup time**: 2-3 seconds

### Option 2: Development with Hot Reload
```bash
cd C:\Users\APPLE\Downloads\PawOS
npm run dev
```

**What happens**:
1. Starts `webpack serve` on port 3000
2. Starts Electron
3. Any change to renderer code → auto-reload
4. Main process requires manual restart

**Note**: Current renderer build is already up-to-date (Sep 6 12:24)

### Option 3: Full Rebuild + Launch
```bash
cd C:\Users\APPLE\Downloads\PawOS
npm run build
npm run dev:electron
```

**Use case**: After git pull or major changes

---

## I. IF IMPOSSIBLE HERE, LOCAL/CI ENVIRONMENT REQUIRED

### What's Required to Begin P0 Testing

**For Local Developer Desktop**:
- Windows 10+, macOS, or Linux with X11/Wayland
- 4GB RAM minimum
- GPU acceleration preferred (for Companion 3D canvas)
- `npm` and Node.js (already present)
- Electron binary (in node_modules, already present)

**Command to launch**:
```bash
npm run dev:electron
```

**Then**:
1. Sign up new user with test email
2. Navigate through app
3. Run P0 tests manually

**Estimated time**: 2-3 hours for all 27 P0 tests + captures

---

### For CI/CD (GitLab/GitHub Actions)

**Requirements**:
1. Linux runner with:
   - `xvfb` (virtual X11 display)
   - `dbus` (D-Bus session bus)
   - Chromium/X11 libraries
   
2. Script:
```bash
#!/bin/bash
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
dbus-launch npm run dev:electron &
sleep 3
# Run test automation (Puppeteer/Playwright + Electron WebDriver)
```

3. Test automation:
   - Puppeteer or Playwright to drive the UI
   - Screenshots + assertions
   - Database queries to verify state

**OR Windows runner**:
- No special setup needed — just run `npm run dev:electron`
- Test automation via Puppeteer/Electron WebDriver

---

## SUMMARY TABLE

| Question | Answer |
|----------|--------|
| **A. Existing Electron launch command** | `npm run dev:electron` |
| **B. Required environment variables** | None (defaults embedded) |
| **C. Required backend processes** | None (remote Supabase + APIs) |
| **D. Required ports** | None (all HTTPS remote) |
| **E. Renderer loading path** | `file:///...dist/renderer/index.html` |
| **F. Existing automated test capability** | None (no E2E harness in package.json) |
| **G. Current environment can launch Electron** | ❌ NO (CLI-only, no graphics) |
| **H. Exact command for local launch** | `npm run dev:electron` |
| **I. If impossible here** | Requires local desktop or CI Linux/Windows runner |

---

## CONCLUSION

**To run P0 tests**:

1. **On local developer machine** (recommended):
   - Open terminal
   - `cd C:\Users\APPLE\Downloads\PawOS`
   - `npm run dev:electron`
   - Wait for Electron to start
   - Run TEST-AUTH-001 manually (email sign-up)

2. **Via CI/CD** (for automation):
   - Set up GitLab/GitHub runner with display server
   - Add Puppeteer/Playwright + test automation scripts
   - Run `npm run dev:electron` in background
   - Drive tests via automation

3. **In this current CLI-only environment**:
   - ❌ Cannot launch Electron (no graphics)
   - ✅ Can prepare and validate setup (done)
   - ✅ Can verify builds compile (done)
   - ❌ Cannot execute P0 tests without interactive runtime

---

