import type { HelpArticle } from '../HelpArticleTypes';

export const COMPANION_ARTICLES: HelpArticle[] = [
  {
    id: 'meet-paw',
    category: 'companion',
    title: 'Meet Paw',
    summary: 'What your companion is, how it looks and moves, and how to turn it on.',
    overview:
      'Paw is a rigged 3D companion rendered with three.js. It runs procedural motion (breathing, ' +
      'gentle sway, and head-look toward what you’re doing), a dynamic canvas-composited face that ' +
      'draws real eye and mouth expressions live, and a full emotion engine that decides how it reacts ' +
      'to what’s happening in the app. Paw is off by default — it never appears until you explicitly ' +
      'enable it from Home.',
    features: [
      'A textured, rigged 3D avatar rendered with three.js',
      'Procedural motion: breathing, sway, and head-look, layered on top of any animation',
      'A dynamic face texture compositor that draws live eye and mouth expressions',
      'A full emotion engine that reacts to conversation state and idle time',
      'Idle-life behaviors so Paw feels present even when you’re not actively talking to it',
      'Desktop notification reactions — Paw responds visibly when a background task finishes',
    ],
    howItWorks:
      'Click "Enable companion" on Home to spawn Paw in a small always-on-top, click-through overlay window. ' +
      'Paw’s animation state machine crossfades between idle, talking, thinking, and reaction clips based on ' +
      'what the conversation runtime reports. The face and emotion layers run independently of the body ' +
      'animation, so Paw can look happy while idle-animating, or focused while listening. Disable the ' +
      'companion any time from the same place — it stops rendering immediately.',
    bestPractices: [
      'Enable the companion only when you actually want a visible presence — it is not required for Projects or coding work',
      'Give the overlay window room on your screen; it is click-through outside of Paw itself so it never blocks your other apps',
      'Use Companion Studio (not this article) to change Paw’s appearance, voice, or personality',
    ],
    examples: [
      {
        title: 'Turning Paw on and off',
        steps: [
          'Go to Home',
          'Click "Enable companion"',
          'Paw appears in a small overlay window',
          'Click "Disable companion" on Home whenever you want it to disappear',
        ],
      },
    ],
    troubleshooting: [
      'If Paw never appears, confirm you clicked "Enable companion" on Home — it is off by default',
      'If Paw appears frozen, check that an AI provider/API key is configured, since emotion/reaction updates depend on it',
      'If the overlay window is not visible, it may be behind another always-on-top window — try minimizing other apps',
    ],
    requirements: ['A companion must be created or the default one available before enabling'],
    permissions: ['No special OS permission is required to display the companion overlay'],
    relatedArticleIds: ['companion-studio', 'voice-conversations', 'companion-behaviors', 'personalities'],
    relatedSettings: ['Companion', 'Appearance'],
    relatedApps: ['home', 'companionLab', 'talk'],
    faq: [
      { question: 'Is the companion required?', answer: 'No. Paw is entirely optional and off by default — you can use PawOS’s project and coding tools without ever enabling it.' },
      { question: 'Can I move the companion window?', answer: 'The overlay is a small, fixed-size, click-through window designed to stay out of your way rather than a freely repositioned widget.' },
      { question: 'Does Paw keep running when I close PawOS?', answer: 'No — the companion overlay only exists while the PawOS app itself is running.' },
    ],
    keywords: ['companion', 'paw', 'avatar', '3d', 'enable companion', 'overlay'],
    aliases: ['Paw', 'Enable companion', 'Disable companion', 'Companion overlay'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'voice-conversations',
    category: 'companion',
    title: 'Voice Conversations',
    summary: 'Talking to Paw with push-to-talk, real speech-to-text and text-to-speech.',
    overview:
      'Talk with Paw is a push-to-talk voice conversation experience: hold the talk control, speak, and ' +
      'release. Your speech is transcribed in real time, sent to the configured AI provider, and the ' +
      'response is streamed back sentence-by-sentence as speech, with mouth-shape (viseme) timing synced ' +
      'to what Paw is saying so its face moves in time with the audio.',
    features: [
      'Push-to-talk voice input with real speech-to-text',
      'Streaming, sentence-chunked text-to-speech responses',
      'Viseme timing so mouth shapes match the spoken audio',
      'A semantic (not just time-based) decision for whether a new utterance continues the same conversation session',
      'Low-latency handling tuned specifically for an instant, natural push-to-talk feel',
    ],
    howItWorks:
      'When you hold the talk control, PawOS starts capturing your microphone and streaming a live transcript. ' +
      'Releasing it sends the transcript to the reasoning provider. As the reply streams back, PawOS speaks it ' +
      'sentence by sentence rather than waiting for the whole response, so Paw starts talking almost immediately. ' +
      'Each turn is saved to your Conversation History.',
    bestPractices: [
      'Speak naturally — you do not need to pause between sentences, since replies stream as they are generated',
      'Make sure a working microphone is selected at the OS level before your first conversation',
      'Configure an AI provider/API key in Settings first — voice conversations will not work without one',
    ],
    examples: [
      {
        title: 'Your first voice conversation',
        steps: [
          'Enable the companion from Home',
          'Open Talk with Paw',
          'Hold the push-to-talk control and ask a question',
          'Release and listen to Paw’s streamed spoken reply',
          'Check Conversation History afterward to see the saved transcript',
        ],
      },
    ],
    troubleshooting: [
      'If nothing is transcribed, check your OS microphone permission and default input device',
      'If Paw does not speak back, confirm a reasoning/voice provider is configured in Settings',
      'If speech is delayed, this is usually provider latency, not a PawOS bug — try a different configured provider',
    ],
    requirements: ['A working microphone', 'A configured AI/voice provider'],
    permissions: ['Microphone access is requested the first time you use push-to-talk'],
    relatedArticleIds: ['meet-paw', 'memory', 'conversation-history'],
    relatedSettings: ['Voice', 'Notifications'],
    relatedApps: ['talk', 'history'],
    faq: [
      { question: 'Can I type instead of speaking?', answer: 'Talk with Paw is built around push-to-talk voice; text-based interaction happens through the Help Center’s Messages, not this feature.' },
      { question: 'Why does the reply start speaking before it finishes generating?', answer: 'Responses are streamed and spoken sentence-by-sentence to feel instant rather than waiting for the entire reply.' },
      { question: 'Is my voice sent anywhere besides the configured AI provider?', answer: 'No — speech is transcribed and sent only to whichever AI provider you have configured in Settings.' },
    ],
    keywords: ['voice', 'talk with paw', 'push to talk', 'text to speech', 'speech to text', 'viseme'],
    aliases: ['Talk with Paw', 'Push-to-talk', 'Voice chat'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'companion-memory',
    category: 'companion',
    title: 'Memory',
    summary: 'What Paw remembers about you between conversations, and where it’s stored.',
    overview:
      'Each companion has its own persistent memory store, scoped to that specific companion, so Paw can ' +
      'remember details across separate conversations rather than starting fresh every time. Memory is ' +
      'stored locally on your device, not shared to the cloud or to other companions.',
    features: [
      'A per-companion memory store, separate for each companion you create',
      'Persists across app restarts — memory is not lost when you close PawOS',
      'Included in a companion’s exported .paw package, so memory travels with backup/restore',
    ],
    howItWorks:
      'As you talk with a companion, relevant details are written to that companion’s memory store. ' +
      'On future conversations, the runtime can draw on this memory to keep continuity, rather than treating ' +
      'each session as isolated.',
    bestPractices: [
      'Export a companion (Companion Package) periodically if its memory has become valuable to you — this backs it up',
      'Remember that memory is per-companion: switching to a different companion does not carry memories over',
    ],
    examples: [
      {
        title: 'Backing up a companion’s memory',
        steps: [
          'Open Companion Studio',
          'Select the companion',
          'Export it as a .paw package',
          'Store the file somewhere safe',
          'Import it later to restore the companion and its memory',
        ],
      },
    ],
    troubleshooting: [
      'If a companion seems to have "forgotten" something, confirm you are talking to the same companion — memory does not transfer between different companions',
      'If memory seems lost after reinstalling PawOS, restore it from a previously exported .paw package',
    ],
    requirements: [],
    permissions: ['No special permission beyond normal local file access'],
    relatedArticleIds: ['companion-studio', 'meet-paw', 'shared-companion'],
    relatedSettings: ['Companion', 'Privacy'],
    relatedApps: ['companionLab'],
    faq: [
      { question: 'Is companion memory sent to the cloud?', answer: 'No — memory is stored locally on your device, scoped to that companion.' },
      { question: 'Can two companions share memory?', answer: 'No, each companion has its own separate memory store.' },
      { question: 'Can I clear a companion’s memory?', answer: 'Memory is managed from Companion Studio alongside the companion’s other settings.' },
    ],
    keywords: ['memory', 'companion memory', 'remember', 'persistence'],
    aliases: ['Companion memory', 'What Paw remembers'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'companion-permissions',
    category: 'companion',
    title: 'Permissions',
    summary: 'What the companion is and isn’t allowed to do on its own.',
    overview:
      'The companion never takes destructive or consequential actions silently. Every action that touches ' +
      'your files, git history, terminal, or system — whether requested through conversation or through the ' +
      'Coding Canvas — goes through the same gated execution engine that requires your explicit confirmation ' +
      'first.',
    features: [
      'A confirm-then-retry gate before any destructive action (delete, overwrite, commit, checkout)',
      'An allowlisted set of safe terminal commands — arbitrary commands are not silently permitted',
      'A local Paw Go / Paw Pro coding-mode toggle so read-only planning never accidentally executes anything',
    ],
    howItWorks:
      'When the companion (via the Coding Intelligence Runtime or conversation actions) wants to do something ' +
      'consequential, it describes the action and waits for your confirmation before executing. Nothing runs ' +
      'in the background without this step.',
    bestPractices: [
      'Read what an action says it will do before confirming, especially for git or file-write actions',
      'Use Paw Go mode when you only want analysis and no risk of file changes',
    ],
    examples: [],
    troubleshooting: [
      'If an action seems to be waiting, check for a pending confirmation prompt rather than assuming it failed',
    ],
    requirements: [],
    permissions: ['File system access for project files you’ve opened', 'Confirmation is always required before destructive actions'],
    relatedArticleIds: ['security', 'ai-coding', 'git-repositories'],
    relatedSettings: ['Privacy', 'Security'],
    relatedApps: ['development', 'projects'],
    faq: [
      { question: 'Can the companion delete my files without asking?', answer: 'No — file deletion and overwrite always require your explicit confirmation first.' },
      { question: 'What is Paw Go mode?', answer: 'A local coding-mode toggle that restricts the companion to planning and analysis only, with no file writes, commands, or builds.' },
    ],
    keywords: ['permissions', 'companion permissions', 'safety', 'confirm', 'paw go', 'paw pro'],
    aliases: ['Companion permissions', 'Confirm action', 'Paw Go mode'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'companion-studio',
    category: 'companion',
    title: 'Companion Studio',
    summary: 'The editor for creating, customizing, and managing your companions.',
    overview:
      'Companion Studio is where you create and edit companions: appearance, voice, behavior, personality, ' +
      'and memory in one place, plus tools to upload an existing 3D model as a companion and to export or ' +
      'import a companion as a portable .paw package.',
    features: [
      'Unified tabs for appearance, voice, behavior, personality, and memory',
      'Upload Existing Companion — bring your own GLB, GLTF, VRM, FBX, or OBJ model',
      'Real thumbnail generation for each companion',
      'Drag-and-drop upload with loading/progress states',
      'Export/import as a .paw package for backup, restore, and portability',
      'A local Companion Gallery to browse and manage multiple companions',
    ],
    howItWorks:
      'Open Companion Studio from the sidebar. Create a new companion from a preset personality, or use ' +
      '"Upload Existing Companion" to bring your own model file. Adjust voice speed/emotion, behavior, and ' +
      'personality from their respective tabs. Export the finished companion as a .paw file to back it up or ' +
      'share it with yourself on another install (there is no cloud marketplace — see Shared Companion).',
    bestPractices: [
      'Generate a thumbnail after major appearance changes so the Gallery stays accurate',
      'Export a .paw backup before making risky changes to a companion you care about',
      'Use drag-and-drop for uploading model files — it shows real progress rather than a silent wait',
    ],
    examples: [
      {
        title: 'Uploading your own companion model',
        steps: [
          'Open Companion Studio',
          'Choose "Upload Existing Companion"',
          'Drag a GLB/GLTF/VRM/FBX/OBJ file onto the drop zone',
          'Wait for real upload/processing progress to complete',
          'Review the generated thumbnail and save',
        ],
      },
    ],
    troubleshooting: [
      'If an uploaded model fails, confirm it is one of the supported formats (GLB, GLTF, VRM, FBX, OBJ)',
      'If a thumbnail looks wrong, regenerate it after any appearance change',
      'Confirmation dialogs appear before any impactful action (like deleting a companion) — this is expected, not a bug',
    ],
    requirements: ['A supported 3D model file for Upload Existing Companion (GLB/GLTF/VRM/FBX/OBJ)'],
    permissions: ['Local file access to read the model file you choose to upload'],
    relatedArticleIds: ['personalities', 'meet-paw', 'shared-companion', 'companion-memory'],
    relatedSettings: ['Companion', 'Voice', 'Appearance'],
    relatedApps: ['companionLab'],
    faq: [
      { question: 'What 3D formats can I upload?', answer: 'GLB, GLTF, VRM, FBX, and OBJ.' },
      { question: 'Can I have more than one companion?', answer: 'Yes — the Companion Gallery lets you create and manage multiple companions locally.' },
      { question: 'How do I back up a companion?', answer: 'Export it as a .paw package from Companion Studio; import that file later to restore it.' },
    ],
    keywords: ['companion studio', 'upload companion', 'glb', 'gltf', 'vrm', 'fbx', 'obj', '.paw package'],
    aliases: ['Companion Studio', 'Upload Existing Companion', '.paw file'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 4,
  },
  {
    id: 'personalities',
    category: 'companion',
    title: 'Personalities',
    summary: 'The built-in personality presets and what they change.',
    overview:
      'PawOS ships with five real personality presets — friendly, professional, creative, teacher, and ' +
      'assistant — that shape how your companion communicates and behaves, configurable per companion.',
    features: [
      'Friendly, Professional, Creative, Teacher, and Assistant presets',
      'Per-companion configuration — different companions can have different personalities',
      'Combines with voice speed/emotion controls for a fuller character',
    ],
    howItWorks:
      'Pick a personality preset in Companion Studio’s personality tab. It influences tone and behavior in ' +
      'conversation and reactions, alongside the voice and behavior settings you configure separately.',
    bestPractices: [
      'Choose Professional or Assistant for focused work sessions, Friendly or Creative for casual use',
      'Combine a personality with matching voice speed/emotion settings for a more consistent character',
    ],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['companion-studio', 'meet-paw', 'companion-behaviors'],
    relatedSettings: ['Companion'],
    relatedApps: ['companionLab'],
    faq: [
      { question: 'Can I create a custom personality beyond the five presets?', answer: 'Today, personality is chosen from the five built-in presets — there is no free-text custom personality editor yet.' },
      { question: 'Does personality affect voice?', answer: 'Personality and voice speed/emotion are configured separately in Companion Studio, and work together.' },
    ],
    keywords: ['personality', 'personalities', 'friendly', 'professional', 'creative', 'teacher', 'assistant'],
    aliases: ['Personality presets'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'shared-companion',
    category: 'companion',
    title: 'Shared Companion',
    summary: 'Managing multiple local companions today, and what cloud sharing looks like in the future.',
    overview:
      'PawOS has a real, local Companion Gallery for browsing and managing multiple companions you’ve ' +
      'created on this device. There is no cloud marketplace or cross-user sharing feature yet — that is a ' +
      'roadmap item, not something available today.',
    features: [
      'A local Companion Gallery listing every companion you’ve created or uploaded on this device',
      'Export/import via .paw packages as the current way to move a companion between your own installs',
    ],
    howItWorks:
      'Companions you create appear in the Gallery inside Companion Studio. To move a companion to another ' +
      'install of PawOS you own, export it as a .paw package and import it there.',
    bestPractices: [
      'Use .paw export/import as your current method of moving a companion between your own devices',
      'Do not expect other users to be able to browse or install your companions yet — that capability is not built',
    ],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['companion-studio', 'cloud-sync', 'companion-memory'],
    relatedSettings: ['Companion'],
    relatedApps: ['companionLab'],
    faq: [
      { question: 'Can I share a companion with another PawOS user?', answer: 'Not yet — there is no cloud marketplace or user-to-user sharing today. A .paw file can be manually shared as a file, but there is no in-app discovery or marketplace.' },
      { question: 'Is a companion marketplace planned?', answer: 'A cloud-based Companion Gallery/marketplace is a roadmap idea, not a shipped feature.' },
    ],
    keywords: ['shared companion', 'companion gallery', 'marketplace', 'sharing'],
    aliases: ['Companion Gallery', 'Share companion'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'companion-behaviors',
    category: 'companion',
    title: 'Companion Behaviors',
    summary: 'How Paw behaves when idle, and how it reacts to background events.',
    overview:
      'Beyond conversation, Paw has an idle-life behavior system that keeps it feeling present when you’re ' +
      'not actively talking to it, and a notification-reaction system that makes it visibly respond when a ' +
      'background task (like a build or install) finishes.',
    features: [
      'Idle-life behaviors — small, ambient animations and looks when not in active conversation',
      'Desktop notification reactions tied to real background task completion',
      'A documented set of expressive states (including wave and point), with honest substitutes where a dedicated clip does not exist',
    ],
    howItWorks:
      'The animation state machine crossfades between idle behaviors on its own timer. When a long-running ' +
      'background action (like an install or a build) completes, the companion reacts visibly rather than the ' +
      'change happening silently.',
    bestPractices: ['Enable desktop notifications in Settings if you want the companion to react to finished background tasks'],
    examples: [],
    troubleshooting: ['If Paw never reacts to a finished task, check that notifications are enabled in Settings'],
    requirements: [],
    permissions: ['Desktop notification permission, if you want reaction notifications'],
    relatedArticleIds: ['meet-paw', 'personalities', 'troubleshooting-companion'],
    relatedSettings: ['Companion', 'Notifications'],
    relatedApps: ['home', 'workHistory'],
    faq: [
      { question: 'Does the companion animate when I’m not talking to it?', answer: 'Yes — idle-life behaviors keep it moving and expressive even outside active conversation.' },
    ],
    keywords: ['companion behaviors', 'idle', 'notification reactions', 'wave', 'point'],
    aliases: ['Idle behaviors', 'Notification reactions'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'troubleshooting-companion',
    category: 'companion',
    title: 'Troubleshooting',
    summary: 'Fixes for the most common companion problems.',
    overview: 'Most companion problems trace back to one of three things: the companion isn’t enabled, an AI provider isn’t configured, or microphone/notification permissions weren’t granted.',
    features: [],
    howItWorks:
      'Work through the checklist in order: is the companion enabled on Home, is an AI provider/API key set in ' +
      'Settings, and does the OS have the right microphone/notification permission granted.',
    bestPractices: [
      'Check Home first — the single most common issue is simply that the companion was never enabled',
      'Check Settings for a configured AI provider before assuming voice or reasoning is broken',
    ],
    examples: [],
    troubleshooting: [
      'Companion not visible: confirm "Enable companion" was clicked on Home',
      'Companion not responding to voice: check microphone OS permission and that a provider/API key is configured',
      'No spoken reply: check speaker output and the configured voice provider',
      'Companion looks frozen: an emotion/reaction update depends on a configured AI provider — verify Settings',
      'No reaction to a finished background task: check that desktop notifications are enabled',
    ],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['meet-paw', 'companion-permissions', 'voice-conversations'],
    relatedSettings: ['Companion', 'Voice', 'Notifications'],
    relatedApps: ['home', 'settings'],
    faq: [
      { question: 'I enabled the companion but see nothing — what now?', answer: 'Check that the overlay window is not hidden behind another always-on-top window, and confirm the companion was actually enabled (not just created) from Home.' },
    ],
    keywords: ['troubleshooting', 'companion not working', 'fix companion'],
    aliases: ['Companion troubleshooting'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
];
