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
      'Email, Google, and GitHub sign-in, each backed by real authentication',
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
      'Start on Paw Go if you want the free authenticated plan before upgrading',
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
          'Sign in or create an account on the auth screen',
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
          'Yes. Paw Go is free, but PawOS requires an authenticated account.',
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
          'Local project data stays on your machine, but voice conversations, AI-driven coding tasks, and sign-in require an internet connection to reach the configured AI provider or Supabase.',
      },
      {
        question: 'Where do I see everything PawOS has done for me?',
        answer:
          'Work History and Conversation History, both reachable from the sidebar, give you a real, unfiltered record of tasks and conversations — nothing is summarized away or fabricated.',
      },
      {
        question: 'Can I use PawOS without an account?',
        answer: 'No. PawOS requires an account. Paw Go is the free authenticated plan.',
      },
    ],
    relatedArticleIds: ['installing-pawos', 'first-launch', 'account-required', 'navigation', 'meet-paw'],
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
      'sign-in is handled inside the app after installation.',
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
          'Wait for the splash screen, then sign in with Email, Google, or GitHub on the auth screen',
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
        answer: 'No, installation does not require an account. You sign in after installing, when the app first launches.',
      },
      {
        question: 'How do I update PawOS?',
        answer: 'Install the newer version over the existing one using the latest installer, then relaunch the app so the update takes effect.',
      },
      {
        question: 'Where is my data stored after installing?',
        answer: 'PawOS keeps local project and companion data in your local user profile, separate from the application installation files.',
      },
      {
        question: 'Can I uninstall PawOS like any other Windows app?',
        answer: 'Yes, PawOS can be removed through the standard Windows "Apps & features" uninstall flow.',
      },
    ],
    relatedArticleIds: ['welcome-to-pawos', 'first-launch', 'account-required'],
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
      'An authentication screen offering Email, Google, and GitHub sign-in',
      'A Dashboard (Home) landing screen once you are signed in',
      'No forced tutorial or wizard blocking access to the app',
    ],
    howItWorks:
      'On launch, PawOS displays a splash screen briefly while core services start up. It then shows the ' +
      'authentication screen with Email, Google, and GitHub sign-in. Once you ' +
      'have picked one, PawOS takes you straight to the Dashboard, where the sidebar and Home section are ready ' +
      'to use. The companion is not enabled automatically — you decide if and when to bring Paw on screen.',
    bestPractices: [
      'Use Paw Go first if you are exploring before upgrading to paid runtime execution',
      'Have your Google account or email ready if you want your data tied to an account from the start',
      'Visit Settings early to add an AI provider/API key so voice and coding features work right away',
      'Take a moment on Home to look at the sidebar before diving into a specific section',
    ],
    examples: [
      {
        title: 'First-launch walkthrough',
        steps: [
          'Open PawOS and watch the splash screen',
          'On the authentication screen, choose Email, Google, or GitHub',
          'Complete sign-in',
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
      'A Google or GitHub account, or an email address for Email sign-in',
    ],
    permissions: [
      'No file system or microphone permissions are requested during first launch itself',
      'Permissions are requested later, only when you use a feature that needs them',
    ],
    faq: [
      {
        question: 'Can I skip signing in entirely?',
        answer: 'No. PawOS requires an authenticated account before opening the Dashboard.',
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
    relatedArticleIds: ['welcome-to-pawos', 'account-required', 'google-sign-in', 'navigation'],
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
    id: 'account-required',
    category: 'gettingStarted',
    title: 'Account Required',
    summary: 'PawOS requires an authenticated account. Paw Go remains free.',

    overview:
      'PawOS requires a signed-in account before opening the Dashboard. Paw Go remains the free authenticated ' +
      'plan for planning, analysis, guidance, local workspace use, and account-scoped settings.',
    features: [
      'Email, Google, and GitHub sign-in',
      'Paw Go as the free authenticated plan',
      'Runtime execution gated by account entitlements',
      'Paw Credits extend compute only and do not unlock runtime access',
    ],
    howItWorks:
      'Choose Email, Google, or GitHub on the authentication screen. Once authenticated, your account starts ' +
      'on Paw Go unless your subscription or organization membership grants a higher plan.',
    bestPractices: [
      'Use Paw Go to explore before upgrading to paid runtime execution',
      'Use a real email or OAuth account you control',
      'Review Settings → Billing to confirm your current plan and runtime access',
    ],
    examples: [
      {
        title: 'Starting on Paw Go',
        steps: [
          'On the auth screen, sign in with Email, Google, or GitHub',
          'Use Paw Go planning, analysis, and guidance features',
          'Upgrade only when you need paid runtime execution',
        ],
      },
    ],
    troubleshooting: [
      'If sign-in fails, confirm your internet connection and authentication provider configuration',
      'If your plan looks wrong, open Settings → Billing and refresh your subscription state',
    ],
    requirements: [
      'A PawOS account',
      'An internet connection for sign-in',
    ],
    permissions: [
      'File system access is requested only when you create or import a project',
      'Microphone access is requested only when you use voice conversations',
    ],
    faq: [
      {
        question: 'Is PawOS still free to start?',
        answer: 'Yes. Paw Go is free, but it requires an authenticated account.',
      },
      {
        question: 'Do Paw Credits unlock runtime access?',
        answer: 'No. Paw Credits extend compute only; runtime access is controlled by entitlement.',
      },
      {
        question: 'Can I use PawOS without signing in?',
        answer: 'No. PawOS requires an authenticated account.',
      },
      {
        question: 'What does Paw Go include?',
        answer: 'Paw Go includes authenticated free-plan access with existing planning, analysis, and guidance restrictions.',
      },
      {
        question: 'Can I downgrade to Paw Go?',
        answer: 'Plan changes use the existing billing and subscription flow.',
      },
    ],
    relatedArticleIds: ['first-launch', 'google-sign-in', 'welcome-to-pawos'],
    relatedSettings: ['Account', 'Billing'],
    relatedApps: ['home', 'settings'],
    keywords: ['account required', 'paw go', 'free plan', 'runtime entitlement'],
    aliases: ['Account Required', 'Paw Go', 'Free plan'],
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
    summary: 'Signing in to PawOS with Google, and how it compares to Email sign-in.',

    overview:
      'Google Sign-In gives you a full PawOS account backed by real OAuth, handled through Supabase. Signing in ' +
      'with Google links your PawOS data to your Google identity. When you link Google Sign-In, PawOS sends ' +
      'a confirmation email to the associated address as part of completing the link.',
    features: [
      'Real Google OAuth sign-in, not a mock or placeholder flow',
      'Backed by Supabase Auth for account and session management',
      'A confirmation email sent when a Google account is linked',
      'Works as an account sign-in path',
    ],
    howItWorks:
      'Choosing "Continue with Google" on the authentication screen opens the standard Google OAuth consent ' +
      'flow. After you approve access, Google redirects back to PawOS with your identity, and Supabase Auth ' +
      'establishes your PawOS session. If this Google account is being linked for the first time, PawOS sends ' +
      'a confirmation email so you have a record that the link was made.',
    bestPractices: [
      'Use the Google account you want your PawOS data permanently associated with',
      'Check your inbox for the confirmation email after linking, and keep it for your records',
      'Complete the Google flow fully rather than closing the browser window mid-flow',
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
    ],
    troubleshooting: [
      'If the Google window does not open, check for blocked pop-ups and try again',
      'If sign-in completes in the browser but PawOS does not update, return to the PawOS window and wait a moment for the session to sync',
      'If you do not receive the confirmation email, check spam/junk folders before retrying the link',
      'If Google Sign-In is unavailable, use Email sign-in instead',
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
        question: 'Can I use Google Sign-In for my PawOS account?',
        answer: 'Yes, Google Sign-In is one supported authenticated account path.',
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
    relatedArticleIds: ['first-launch', 'account-required', 'welcome-to-pawos'],
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
    requirements: ['None beyond having completed sign-in'],
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
        answer: 'The core sidebar layout is the same for all signed-in accounts; account-specific options like Upgrade appear in the profile menu.',
      },
      {
        question: 'Can I rearrange the sidebar?',
        answer: 'Not currently — the sidebar order is fixed to keep navigation predictable across sessions.',
      },
    ],
    relatedArticleIds: ['welcome-to-pawos', 'keyboard-shortcuts', 'first-launch'],
    relatedSettings: ['Account', 'Appearance'],
    relatedApps: ['home', 'projects', 'companionLab', 'apps', 'analytics', 'history', 'workHistory', 'settings'],
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
    relatedApps: ['companionLab'],
    keywords: ['keyboard shortcuts', 'push to talk', 'hotkeys', 'voice shortcut'],
    aliases: ['Push-to-talk', 'Shortcuts', 'Hotkeys'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
