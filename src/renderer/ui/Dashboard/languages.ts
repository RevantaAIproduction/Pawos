/**
 * Real, usable languages — each is a genuine BCP-47 code passed straight to
 * the Web Speech API for push-to-talk speech recognition (see
 * SpeechProviders.ts), persisted via Settings so it survives a restart.
 * Shared by ProfileMenu.tsx and Settings → Preferences → General
 * (GeneralSection.tsx) — both surfaces read and write the same persisted
 * setting, so this single list is the one place to add a language.
 */
export const LANGUAGES: { label: string; code: string }[] = [
  { label: 'English (United States)', code: 'en-US' },
  { label: 'Français (France)', code: 'fr-FR' },
  { label: 'Deutsch (Deutschland)', code: 'de-DE' },
  { label: 'हिन्दी (भारत)', code: 'hi-IN' },
  { label: 'తెలుగు (భారత)', code: 'te-IN' },
  { label: 'Español (España)', code: 'es-ES' },
  { label: '日本語 (日本)', code: 'ja-JP' },
];
