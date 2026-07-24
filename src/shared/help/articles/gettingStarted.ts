import type { HelpArticle } from '../HelpArticleTypes';

export const GETTING_STARTED_ARTICLES: HelpArticle[] = [
  {
    id: 'welcome-to-pawos',
    category: 'gettingStarted',
    title: 'Welcome to PawOS',
    summary: 'An overview of what PawOS is, what it does today, and how the pieces fit together.',

    overview:
      'PawOS is a desktop AI-companion application from Revanta AI, built on Electron for Windows. ' +
      'At its core, PawOS pairs a real 3D animated companion — Paw — with a set of practical tools for ' +
      'working with your own projects: opening and analyzing local folders, tracking git repositories, ' +
      'running coding tasks through a live Coding Canvas, and keeping an honest history of what happened. ' +
      'The companion is optional and off by default; you can use PawOS purely as a project and git workspace, ' +
      'purely as a talking companion, or both together.',
    features: [
      'A rigged 3D companion (Paw) with procedural motion, a dynamic face, and an emotion engine',
      'Push-to-talk voice conversations with real text-to-speech and speech-to-text',
      'A Projects section that reflects real folders you have opened, with real git and framework detection',
      'A Coding Canvas that shows live task, terminal, diff, build, and test data while coding tasks run',
      'Guest, Google, and Email sign-in, each backed by real authentication (Supabase)',
      'A persistent Work History and Conversation History so nothing you did is hidden or fabricated',
      'A gated execution engine so the companion never takes destructive actions without your confirmation',
    ],
    howItWorks:
      'When you launch PawOS you land on the Dashboard (Home). From there, the left sidebar gives you access ' +
      'to every part of the app: Talk with Paw for voice conversations, Companion Studio for building and ' +
      'customizing companions, Projects for your folders and git repositories, Apps for auxiliary tools, and ' +
      'Analytics for usage insight. Nothing runs invisibly in the background — the companion is enabled ' +
      'explicitly from Home, and any action that touches your files or git history requires your confirmation ' +
      'before it happens.',
    bestPractices: [
      'Start on Guest mode if you just want to try PawOS — you can upgrade to a full account at any time without losing local data',
      'Enable the companion only when you want it visible; it stays off by default so it never surprises you',
      'Open your real project folders through Import rather than expecting PawOS to invent projects for you',
      'Review the Work History page periodically — it is the ground truth for what PawOS has actually done',
      'Set up an AI provider/API key in Settings early, since both voice conversations and coding tasks depend on it',
    ],
    examples: [
      {
        title: 'A first session in five minutes',
        steps: [
          'Launch PawOS and wait for the splash screen to pass',
          'Choose "Continue as Guest" (or sign in) on the auth screen',
          'Land on Home and review the sidebar sections',
          'Click "Enable companion" on Home if you want to see Paw',
          'Open Projects and Import an existing folder to see real analysis results',
        ],
      },
    ],
    troubleshooting: [
      'If the app feels empty on first launch, that is expected — Projects and History start blank until you import a folder or run a task',
      'If the companion is not visible, confirm it was explicitly enabled from Home; it is off by default',
      'If voice or AI features do not respond, check that an AI provider/API key is configured in Settings',
    ],
    requirements: [
      'Windows desktop (PawOS is distributed as a Windows Electron app via electron-builder)',
      'An internet connection for Google/Email sign-in, voice features, and AI provider calls',
      'A configured AI provider/API key in Settings for companion conversations and coding tasks',
    ],
    permissions: [
      'No permissions are required just to browse the Dashboard',
      'Microphone access is requested only when you use push-to-talk voice conversations',
      'File system access is requested only when you create or import a project folder',
    ],
    faq: [
      {
        question: 'Is PawOS free to use?',
        answer:
          'Yes, you can use PawOS as a Guest with no account and no cost. Guest mode is strictly local-only and does not show any fake subscription tier — it is simply the free, unauthenticated way to use the app.',
      },
      {
        question: 'Do I need the companion to use PawOS?',
        answer:
          'No. The companion is an optional, explicitly-enabled feature. You can use Projects, git tooling, and the Coding Canvas without ever enabling Paw.',
      },
      {
        question: 'What platforms does PawOS run on?',
        answer: 'PawOS is currently built and distributed as a Windows desktop application using Electron and electron-builder.',
      },
      {
        question: 'Does PawOS work offline?',
        answer:
          'Guest mode keeps your data local, but voice conversations, AI-driven coding tasks, and sign-in all require an internet connection to reach the configured AI provider or Supabase.',
      },
      {
        question: 'Where do I see everything PawOS has done for me?',
        answer:
          'Work History and Conversation History, both reachable from the sidebar, give you a real, unfiltered record of tasks and conversations — nothing is summarized away or fabricated.',
      },
      {
        question: 'Can I switch from Guest to a real account later?',
        answer: 'Yes, Guest sessions can be upgraded to a Google or Email account at any time without losing your local data.',
      },
    ],
    relatedArticleIds: ['installing-pawos', 'first-launch', 'guest-sessions', 'navigation', 'meet-paw'],
    relatedSettings: ['Account', 'General'],
    relatedApps: ['home'],
    keywords: ['pawos', 'overview', 'introduction', 'what is pawos', 'revanta ai', 'electron desktop app'],
    aliases: ['Welcome', 'Getting Started', 'About PawOS', 'What is PawOS'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'installing-pawos',
    category: 'gettingStarted',
    title: 'Installing PawOS',
    summary: 'How to download, install, and update the PawOS Windows desktop app.',

    overview:
      'PawOS ships as a native Windows desktop application, packaged with electron-builder. Installing it is a ' +
      'standard Windows installer flow: download the installer, run it, and launch PawOS from the Start menu ' +
      'or desktop shortcut like any other application. There is no separate account required to install — ' +
      'sign-in and Guest mode are handled inside the app after installation.',
    features: [
      'A standard Windows installer built with electron-builder',
      'Desktop and Start-menu shortcuts created automatically on install',
      'No separate runtime dependencies to install manually',
      'App data kept in your local user profile, separate from the installation directory',
    ],
    howItWorks:
      'The electron-builder packaging step produces a Windows installer (and the underlying app resources) that ' +
      'installs PawOS like any desktop application: it copies the app into your Windows user or Program Files ' +
      'location, registers a Start menu entry, and creates a desktop shortcut. On first run after install, PawOS ' +
      'shows a splash screen and then takes you to the authentication screen.',
    bestPractices: [
      'Download installers only from the official Revanta AI distribution channel',
      'Close any previous running instance of PawOS before installing an update over it',
      'Keep enough disk space free for the app itself plus local project and companion data',
      'Restart PawOS after installing an update so the new version takes effect',
    ],
    examples: [
      {
        title: 'Installing PawOS for the first time',
        steps: [
          'Download the PawOS Windows installer from the official source',
          'Run the installer and follow the on-screen prompts',
          'Launch PawOS from the Start menu or the new desktop shortcut',
          'Wait for the splash screen, then choose Guest, Google, or Email on the auth screen',
        ],
      },
    ],
    troubleshooting: [
      'If Windows SmartScreen warns about an unrecognized app, verify you downloaded the installer from the official source before proceeding',
      'If the installer will not run, confirm you have permission to install applications on the machine',
      'If PawOS does not appear after install, check the Start menu search for "PawOS" or look for the desktop shortcut',
      'If an update seems not to have applied, fully close PawOS (including any tray icon) and relaunch it',
    ],
    requirements: [
      'A 64-bit Windows machine',
      'Sufficient free disk space for the application and local data',
      'Administrator rights may be needed depending on the install location chosen by the installer',
    ],
    permissions: [
      'Standard Windows install permissions to write the application files and create shortcuts',
      'No additional permissions are requested during installation itself',
    ],
    faq: [
      {
        question: 'Is PawOS available for macOS or Linux?',
        answer: 'PawOS is currently packaged and distributed for Windows only, via electron-builder.',
      },
      {
        question: 'Do I need to create an account to install PawOS?',
        answer: 'No, installation does not require an account. You choose Guest, Google, or Email sign-in after installing, when the app first launches.',
      },
      {
        question: 'How do I update PawOS?',
        answer: 'Install the newer version over the existing one using the latest installer, then relaunch the app so the update takes effect.',
      },
      {
        question: 'Where is my data stored after installing?',
        answer: 'PawOS keeps local data such as Guest projects and companion data in your local user profile, separate from the application installation files.',
      },
      {
        question: 'Can I uninstall PawOS like any other Windows app?',
        answer: 'Yes, PawOS can be removed through the standard Windows "Apps & features" uninstall flow.',
      },
    ],
    relatedArticleIds: ['welcome-to-pawos', 'first-launch', 'guest-sessions'],
    relatedSettings: ['General', 'Updates'],
    relatedApps: ['home', 'settings'],
    keywords: ['install', 'installer', 'download', 'setup', 'electron-builder', 'windows app', 'update'],
    aliases: ['Download PawOS', 'Setup', 'Install', 'Windows installer'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'first-launch',
    category: 'gettingStarted',
    title: 'First Launch',
    summary: 'What to expect the first time you open PawOS, from splash screen to Dashboard.',

    overview:
      'The first time you open PawOS, it walks you through a short, fixed sequence: a splash screen while the ' +
      'app initializes, an authentication screen where you choose how to sign in, and finally the Dashboard ' +
      '(Home) itself. There is no lengthy setup wizard — the goal is to get you to a usable Dashboard as fast ' +
      'as possible, with everything else (enabling the companion, importing a project, configuring an AI ' +
      'provider) left as an explicit choice you make afterward.',
    features: [
      'A splash screen shown while PawOS initializes',
      'An authentication screen offering Guest, Google Sign-In, and Email sign-in',
      'A Dashboard (Home) landing screen once you are signed in',
      'No forced tutorial or wizard blocking access to the app',
    ],
    howItWorks:
      'On launch, PawOS displays a splash screen briefly while core services start up. It then shows the ' +
      'authentication screen with three choices: continue as Guest (local-only, no account), sign in with ' +
      'Google (real OAuth via Supabase), or sign in with Email (Supabase Auth with OTP verification). Once you ' +
      'have picked one, PawOS takes you straight to the Dashboard, where the sidebar and Home section are ready ' +
      'to use. The companion is not enabled automatically — you decide if and when to bring Paw on screen.',
    bestPractices: [
      'Pick Guest first if you are only exploring — you lose nothing by upgrading to a real account later',
      'Have your Google account or email ready if you want your data tied to an account from the start',
      'Visit Settings early to add an AI provider/API key so voice and coding features work right away',
      'Take a moment on Home to look at the sidebar before diving into a specific section',
    ],
    examples: [
      {
        title: 'First-launch walkthrough',
        steps: [
          'Open PawOS and watch the splash screen',
          'On the authentication screen, choose Guest, Google, or Email',
          'Complete sign-in (or skip it entirely with Guest)',
          'Arrive at the Dashboard (Home)',
          'Explore the sidebar: Home, Talk with Paw, Companion Studio, Projects, Apps, Analytics',
        ],
      },
    ],
    troubleshooting: [
      'If the splash screen appears stuck, check your internet connection since sign-in options need connectivity',
      'If Google Sign-In does not complete, confirm you finished the browser-based OAuth step and returned to PawOS',
      'If Email sign-in asks for a code you did not receive, check spam/junk folders for the OTP email',
      'If the Dashboard looks empty, that is expected on first launch — no projects or history exist yet',
    ],
    requirements: [
      'An internet connection for the authentication step',
      'A Google account (for Google Sign-In) or an email address (for Email sign-in), if not using Guest',
    ],
    permissions: [
      'No file system or microphone permissions are requested during first launch itself',
      'Permissions are requested later, only when you use a feature that needs them',
    ],
    faq: [
      {
        question: 'Can I skip signing in entirely?',
        answer: 'Yes, choosing "Continue as Guest" skips account creation and takes you straight into a local-only session.',
      },
      {
        question: 'What happens if I close PawOS during first launch?',
        answer: 'Nothing is lost — reopening PawOS simply resumes at the same splash screen and auth flow until you complete it.',
      },
      {
        question: 'Does first launch install anything extra?',
        answer: 'No, first launch only initializes the app and shows the authentication screen; no additional downloads happen at this stage.',
      },
      {
        question: 'Will the companion appear automatically on first launch?',
        answer: 'No, the companion is disabled by default and only appears after you explicitly enable it from Home.',
      },
      {
        question: 'Is there a tutorial that runs on first launch?',
        answer: 'Not currently. PawOS takes you directly to the Dashboard, and this Help Center is the place to learn what each section does.',
      },
    ],
    relatedArticleIds: ['welcome-to-pawos', 'guest-sessions', 'google-sign-in', 'navigation'],
    relatedSettings: ['Account', 'General'],
    relatedApps: ['home'],
    keywords: ['first launch', 'splash screen', 'onboarding', 'auth screen', 'sign in'],
    aliases: ['First time opening PawOS', 'Splash screen', 'Auth screen'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'guest-sessions',
    category: 'gettingStarted',
    title: 'Guest Sessions',
    summary: 'Using PawOS without an account, and what Guest mode does and does not include.',

    overview:
      'Guest mode lets you use PawOS immediately with no account and no cloud data. Everything you do as a ' +
      'Guest — projects you open, companions you create, history that accumulates — is kept locally on your ' +
      'machine. Guest mode is strictly a free, no-tier way to use the app: it never shows a fake subscription ' +
      'tier or paywall dressed up as a plan. You can upgrade a Guest session to a real Google or Email account ' +
      'at any time, and your local data carries forward.',
    features: [
      'Instant access to PawOS with no sign-up step',
      'Strictly local-only data — nothing is sent to the cloud while in Guest mode',
      'No fake or placeholder subscription tier shown to Guests',
      'One-click upgrade path from Guest to a full Google or Email account',
      'Full access to Projects, Companion Studio, and the Coding Canvas while in Guest mode',
    ],
    howItWorks:
      'Choosing "Continue as Guest" on the authentication screen skips sign-in entirely and drops you straight ' +
      'into the Dashboard. Behind the scenes, PawOS stores your projects, companion data, and history locally ' +
      'instead of syncing them to a Supabase-backed account. When you are ready for an account, an "upgrade" ' +
      'action (available from the profile menu or account prompts) walks you through Google or Email sign-in ' +
      'and links your existing local data to the new account rather than starting over.',
    bestPractices: [
      'Use Guest mode to try PawOS before committing to an account',
      'Upgrade to a real account before switching machines, since Guest data is local to the device it was created on',
      'Do not expect cloud backup while in Guest mode — treat local data as the only copy',
      'Upgrade whenever you are ready; there is no urgency or penalty for staying a Guest',
    ],
    examples: [
      {
        title: 'Starting and later upgrading a Guest session',
        steps: [
          'On the auth screen, choose "Continue as Guest"',
          'Use PawOS normally: import a project, enable the companion, run a coding task',
          'When ready for an account, open the profile menu and choose to upgrade',
          'Sign in with Google or Email to complete the upgrade',
          'Confirm your existing projects and companion data are still present after upgrading',
        ],
      },
    ],
    troubleshooting: [
      'If you switch machines, remember Guest data does not follow you — it stays on the original device',
      'If the upgrade prompt does not appear, look for it in the profile menu at the bottom of the sidebar',
      'If you are unsure whether you are in Guest mode, check the account area of Settings, which reflects your current sign-in state',
    ],
    requirements: [
      'No account or internet connection is required to start a Guest session',
      'An internet connection is required only when you choose to upgrade to Google or Email',
    ],
    permissions: [
      'Guest mode requests file system access only when you create or import a project',
      'Guest mode requests microphone access only when you use voice conversations',
    ],
    faq: [
      {
        question: 'Is Guest mode really free with no hidden tier?',
        answer: 'Yes. Guest mode is a genuinely free, no-tier way to use PawOS — it does not display any fabricated subscription plan.',
      },
      {
        question: 'What happens to my data if I upgrade from Guest?',
        answer: 'Your local projects, companion data, and history are carried forward and linked to your new Google or Email account during the upgrade.',
      },
      {
        question: 'Can I use Guest mode on more than one computer with the same data?',
        answer: 'No, Guest data is local to the machine it was created on. To access the same data across devices, upgrade to a real account.',
      },
      {
        question: 'Does Guest mode limit which features I can use?',
        answer: 'No, Guest mode has full access to Projects, Companion Studio, voice conversations, and the Coding Canvas — the difference is that data stays local rather than syncing to an account.',
      },
      {
        question: 'Can I go back to Guest mode after upgrading?',
        answer: 'The upgrade path moves you from Guest to a signed-in account; use Sign out and "Continue as Guest" again if you want a separate local-only session.',
      },
    ],
    relatedArticleIds: ['first-launch', 'google-sign-in', 'welcome-to-pawos'],
    relatedSettings: ['Account', 'Billing'],
    relatedApps: ['home', 'settings'],
    keywords: ['guest mode', 'guest session', 'no account', 'local only', 'upgrade guest'],
    aliases: ['Continue as Guest', 'Guest mode', 'Local-only mode'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'google-sign-in',
    category: 'gettingStarted',
    title: 'Google Sign In',
    summary: 'Signing in to PawOS with Google, and how it compares to Guest and Email sign-in.',

    overview:
      'Google Sign-In gives you a full PawOS account backed by real OAuth, handled through Supabase. Signing in ' +
      'with Google links your PawOS data to your Google identity so it can sync to an account rather than ' +
      'staying local to one device. When you link Google Sign-In (including when upgrading from a Guest ' +
      'session), PawOS sends a confirmation email to the associated address as part of completing the link.',
    features: [
      'Real Google OAuth sign-in, not a mock or placeholder flow',
      'Backed by Supabase Auth for account and session management',
      'A confirmation email sent when a Google account is linked',
      'Works both as a fresh sign-in and as an upgrade path from Guest mode',
    ],
    howItWorks:
      'Choosing "Continue with Google" on the authentication screen opens the standard Google OAuth consent ' +
      'flow. After you approve access, Google redirects back to PawOS with your identity, and Supabase Auth ' +
      'establishes your PawOS session. If this Google account is being linked for the first time (including ' +
      'from an existing Guest session), PawOS sends a confirmation email so you have a record that the link ' +
      'was made.',
    bestPractices: [
      'Use the Google account you want your PawOS data permanently associated with',
      'Check your inbox for the confirmation email after linking, and keep it for your records',
      'If upgrading from Guest, complete the Google flow fully rather than closing the browser window mid-flow',
      'Make sure pop-ups or the OAuth browser window are not being blocked by your system',
    ],
    examples: [
      {
        title: 'Signing in with Google for the first time',
        steps: [
          'On the authentication screen, choose "Continue with Google"',
          'Complete the Google OAuth consent screen in the browser window that opens',
          'Return to PawOS once the flow completes',
          'Check your email for the PawOS confirmation message linking your Google account',
          'Arrive at the Dashboard signed in with your Google account',
        ],
      },
      {
        title: 'Upgrading an existing Guest session with Google',
        steps: [
          'While using PawOS as a Guest, open the profile menu',
          'Choose the option to upgrade using Google',
          'Complete the Google OAuth consent flow',
          'Confirm your existing Guest projects and companion data are now tied to the Google account',
        ],
      },
    ],
    troubleshooting: [
      'If the Google window does not open, check for blocked pop-ups and try again',
      'If sign-in completes in the browser but PawOS does not update, return to the PawOS window and wait a moment for the session to sync',
      'If you do not receive the confirmation email, check spam/junk folders before retrying the link',
      'If Google Sign-In is unavailable, use Email sign-in or Guest mode instead',
    ],
    requirements: [
      'A Google account',
      'An internet connection to complete the OAuth flow',
      'Access to the email inbox associated with the Google account, to receive the confirmation email',
    ],
    permissions: [
      'Standard Google OAuth consent for identity information (email, basic profile)',
      'No additional device permissions are requested as part of Google Sign-In itself',
    ],
    faq: [
      {
        question: 'Is Google Sign-In a real OAuth integration?',
        answer: 'Yes, it uses genuine Google OAuth handled through Supabase Auth, not a simulated login.',
      },
      {
        question: 'Will I get an email when I sign in with Google?',
        answer: 'A confirmation email is sent specifically when a Google account is linked to a PawOS account, so you have a record of the link.',
      },
      {
        question: 'Can I use Google Sign-In to upgrade from Guest mode?',
        answer: 'Yes, the profile menu offers an upgrade path that links your existing Guest data to a Google account.',
      },
      {
        question: 'What if I have multiple Google accounts?',
        answer: 'Make sure to select the specific Google account you want associated with PawOS during the consent flow.',
      },
      {
        question: 'Is Email sign-in different from Google Sign-In?',
        answer: 'Yes, Email sign-in uses Supabase Auth with OTP (one-time code) verification instead of Google OAuth, and includes its own Forgot Password flow.',
      },
    ],
    relatedArticleIds: ['first-launch', 'guest-sessions', 'welcome-to-pawos'],
    relatedSettings: ['Account'],
    relatedApps: ['home', 'settings'],
    keywords: ['google sign in', 'oauth', 'supabase auth', 'continue with google', 'link account'],
    aliases: ['Continue with Google', 'Sign in with Google', 'Google OAuth'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'navigation',
    category: 'gettingStarted',
    title: 'Navigation',
    summary: 'How the PawOS sidebar and Dashboard are laid out, and how to move between sections.',

    overview:
      'PawOS organizes everything around a left sidebar and a Dashboard content area. The sidebar is split into ' +
      'a primary group of daily-use sections, a secondary group of historical/read-only views below a divider, ' +
      'and a profile menu at the very bottom for account-level actions. Understanding this layout is the ' +
      'fastest way to find any feature in the app.',
    features: [
      'Primary navigation: Home, Talk with Paw, Companion Studio, Projects, Apps, Analytics',
      'Secondary navigation (below a divider): Work History and Conversation History',
      'A profile menu at the bottom of the sidebar for Settings, Upgrade, and Sign out',
      'A single consistent sidebar across the whole app, so context is never lost when switching sections',
    ],
    howItWorks:
      'The sidebar is always visible on the left. Clicking a primary item switches the main content area to ' +
      'that section: Home is the Dashboard landing view, Talk with Paw opens voice conversations with your ' +
      'companion, Companion Studio opens the companion editor, Projects lists your imported folders and git ' +
      'repositories, Apps holds auxiliary tools, and Analytics shows usage insight. Below the divider, Work ' +
      'History and Conversation History give you read-only, chronological views of what PawOS has actually ' +
      'done. The profile menu, opened from the bottom of the sidebar, is where Settings, Upgrade, and Sign out ' +
      'live.',
    bestPractices: [
      'Use Home as your starting point whenever you are not sure where to go',
      'Check Work History or Conversation History if you want to confirm what actually happened, rather than relying on memory',
      'Open the profile menu for account-level actions rather than looking for them inside a specific section',
      'Remember the divider: sections above it are for doing things, sections below it are for reviewing what was done',
    ],
    examples: [
      {
        title: 'Finding your way around the sidebar',
        steps: [
          'Start on Home after signing in',
          'Click Projects to see your imported folders',
          'Click Talk with Paw to start a voice conversation',
          'Scroll to the bottom, open the profile menu, and click Settings',
        ],
      },
    ],
    troubleshooting: [
      'If a section looks empty, that usually means no data exists there yet (e.g., no projects imported, no conversations held)',
      'If you cannot find Settings or Sign out, look at the profile menu at the very bottom of the sidebar rather than inside a content section',
      'If the sidebar seems to be missing a section, confirm you are fully signed in rather than still on the authentication screen',
    ],
    requirements: ['None beyond having completed sign-in or Guest entry'],
    permissions: ['Navigation itself requires no special permissions'],
    faq: [
      {
        question: 'What is the difference between Home and Projects?',
        answer: 'Home is the general Dashboard landing view, while Projects specifically lists the real folders you have imported or created, along with their git and framework details.',
      },
      {
        question: 'Where do I find Settings?',
        answer: 'Open the profile menu at the bottom of the sidebar; Settings is listed there along with Upgrade and Sign out.',
      },
      {
        question: 'What is the divider in the sidebar for?',
        answer: 'It separates primary, action-oriented sections (Home, Talk with Paw, Companion Studio, Projects, Apps, Analytics) from secondary, historical sections (Work History, Conversation History).',
      },
      {
        question: 'Does the sidebar change based on account type?',
        answer: 'The core sidebar layout is the same for Guest and signed-in accounts; account-specific options like Upgrade appear in the profile menu.',
      },
      {
        question: 'Can I rearrange the sidebar?',
        answer: 'Not currently — the sidebar order is fixed to keep navigation predictable across sessions.',
      },
    ],
    relatedArticleIds: ['welcome-to-pawos', 'keyboard-shortcuts', 'first-launch'],
    relatedSettings: ['Account', 'Appearance'],
    relatedApps: ['home', 'projects', 'talk', 'companionLab', 'apps', 'analytics', 'history', 'workHistory', 'settings'],
    keywords: ['sidebar', 'navigation', 'dashboard layout', 'menu', 'profile menu'],
    aliases: ['Sidebar', 'Dashboard layout', 'Main menu'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'keyboard-shortcuts',
    category: 'gettingStarted',
    title: 'Keyboard Shortcuts',
    summary: 'The keyboard shortcuts that exist in PawOS today, honestly scoped to what is actually built.',

    overview:
      'PawOS keeps its keyboard shortcut surface small and honest right now. The one real, confirmed ' +
      'shortcut-driven interaction is push-to-talk: holding down a designated key lets you speak to your ' +
      'companion, and releasing it ends your turn so Paw can respond. There is no global command palette, no ' +
      'app-wide hotkey system, and no set of window-management shortcuts yet — this article intentionally does ' +
      'not invent shortcuts that are not in the app.',
    features: [
      'Push-to-talk: hold a key to speak to your companion during a voice conversation',
      'Releasing the push-to-talk key ends your turn and lets the companion respond',
      'No other global keyboard shortcuts are currently implemented',
    ],
    howItWorks:
      'While in a voice conversation with your companion (Talk with Paw), holding down the push-to-talk key ' +
      'activates your microphone and streams your speech to speech-to-text. Releasing the key stops capturing ' +
      'your voice and lets the companion process what you said, respond, and speak back with synced ' +
      'text-to-speech and viseme (mouth-shape) animation. Outside of this push-to-talk interaction, PawOS does ' +
      'not currently bind other actions to keyboard shortcuts.',
    bestPractices: [
      'Hold the push-to-talk key for your entire sentence and release only when you are done speaking',
      'Speak clearly and at a normal pace while holding the key for the most accurate speech-to-text results',
      'Do not expect keyboard shortcuts for navigation or actions outside of voice conversations yet',
    ],
    examples: [
      {
        title: 'Using push-to-talk in a conversation',
        steps: [
          'Open Talk with Paw from the sidebar',
          'Press and hold the push-to-talk key',
          'Speak your message while continuing to hold the key',
          'Release the key when you are finished speaking',
          'Listen as your companion responds with synced voice and mouth animation',
        ],
      },
    ],
    troubleshooting: [
      'If holding the key does not capture audio, check microphone permission for PawOS in Settings',
      'If nothing happens when you release the key, confirm an AI provider/API key is configured, since responses depend on it',
      'If you are looking for a shortcut that is not push-to-talk, it likely does not exist yet in this version',
    ],
    requirements: ['A working microphone', 'Microphone permission granted to PawOS', 'An AI provider/API key configured for the companion to respond'],
    permissions: ['Microphone access is required for push-to-talk to capture your voice'],
    faq: [
      {
        question: 'Is there a command palette or global hotkey system in PawOS?',
        answer: 'Not yet. The only real shortcut-driven interaction today is push-to-talk during voice conversations.',
      },
      {
        question: 'What key is used for push-to-talk?',
        answer: 'Push-to-talk is bound to a designated key inside the Talk with Paw experience; hold it to speak and release it to let the companion respond.',
      },
      {
        question: 'Will more keyboard shortcuts be added later?',
        answer: 'Possibly, but none exist beyond push-to-talk in this version. This article will be updated if that changes.',
      },
      {
        question: 'Can I use push-to-talk outside of Talk with Paw?',
        answer: 'Push-to-talk is part of the voice conversation experience, so it applies wherever that conversation UI is active.',
      },
      {
        question: 'Does releasing the key early cut off my message?',
        answer: 'Yes, releasing the push-to-talk key ends your turn immediately, so hold it until you have finished speaking.',
      },
    ],
    relatedArticleIds: ['navigation', 'voice-conversations', 'meet-paw'],
    relatedSettings: ['Voice'],
    relatedApps: ['talk'],
    keywords: ['keyboard shortcuts', 'push to talk', 'hotkeys', 'voice shortcut'],
    aliases: ['Push-to-talk', 'Shortcuts', 'Hotkeys'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
