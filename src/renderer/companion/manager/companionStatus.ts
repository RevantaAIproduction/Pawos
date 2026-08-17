import type { CompanionProfile } from './CompanionProfileTypes';

export type CompanionModelStatusTone = 'ok' | 'warn' | 'error' | 'neutral';

export type CompanionModelStatus = {
  label: string;
  tone: CompanionModelStatusTone;
  detail: string;
};

/**
 * Honest model/rig status vocabulary shared by the Companion Manager card and
 * the Companion Editor's Appearance tab. Derived purely from
 * CompanionAvatarSource.loadStatus/rigged, which are only ever set from a
 * real load attempt (see Avatar3DOverlay.tsx / CompanionProfileStore.
 * recordUploadLoadResult) — never fabricated.
 */
export function getCompanionModelStatus(profile: CompanionProfile): CompanionModelStatus {
  const source = profile.avatarSource;
  if (!source) {
    return { label: 'DEFAULT MODEL', tone: 'neutral', detail: 'Uses the built-in Paw model — no custom upload.' };
  }
  if (source.loadStatus === 'failed') {
    return {
      label: 'IMPORT FAILED',
      tone: 'error',
      detail: source.loadError ? `Could not load the uploaded file: ${source.loadError}` : 'Could not load the uploaded file.',
    };
  }
  if (source.loadStatus === 'ready') {
    return source.rigged
      ? { label: 'RIG DETECTED', tone: 'ok', detail: 'Already had its own skeleton/animations — imported as-is.' }
      : { label: 'ANIMATION READY', tone: 'ok', detail: 'Had no skeleton of its own — auto-rigged onto the shared skeleton.' };
  }
  return { label: 'RIG REQUIRED', tone: 'warn', detail: 'Not loaded yet — rig/animation status isn’t known until the desktop overlay loads it.' };
}

export const COMPANION_STATUS_COLORS: Record<CompanionModelStatusTone, string> = {
  ok: '#4ade80',
  warn: '#e0b84d',
  error: 'var(--danger, #e05a5a)',
  neutral: 'var(--text-secondary, #9a97b5)',
};
