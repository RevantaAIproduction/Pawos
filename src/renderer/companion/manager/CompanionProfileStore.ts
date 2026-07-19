import { v4 as uuidv4 } from 'uuid';
import {
  createDefaultBehavior,
  createDefaultToneWeights,
  createPawProfile,
  DEFAULT_PAW_ID,
  PERSONALITY_PRESETS,
  type CompanionAvatarSource,
  type CompanionBehavior,
  type CompanionPersonality,
  type CompanionProfile,
  type CompanionVoiceConfig,
} from './CompanionProfileTypes';
import type { CompanionPackageInput, ImportedCompanionPackage } from '../../../shared/companion/CompanionPackageTypes';

const STORAGE_KEY = 'pawos:companions:v1';
const ACTIVE_KEY = 'pawos:companions:active';

type StoredState = {
  profiles: CompanionProfile[];
  activeId: string;
};

/** Profiles saved before Runtime 10's personality presets existed have no `preset` field — default them to 'custom' rather than silently overwriting whatever traits/systemPromptOverride they already had. */
function migratePersonality(profiles: CompanionProfile[]): CompanionProfile[] {
  return profiles.map((p) =>
    p.personality.preset ? p : { ...p, personality: { ...p.personality, preset: 'custom' as const } }
  );
}

/** Profiles saved before Companion Memory's enable/disable toggle existed have no `enabled` field — default to true (memory was always effectively on before this existed). */
function migrateMemoryEnabled(profiles: CompanionProfile[]): CompanionProfile[] {
  return profiles.map((p) => (p.memory.enabled === undefined ? { ...p, memory: { ...p.memory, enabled: true } } : p));
}

/** Profiles saved before Runtime 10's Behavior tab existed have no `behavior` field — default to createDefaultBehavior() (today's actual runtime behavior). */
function migrateBehavior(profiles: CompanionProfile[]): CompanionProfile[] {
  return profiles.map((p) => (p.behavior ? p : { ...p, behavior: createDefaultBehavior() }));
}

/**
 * Profiles saved before the Companion Gallery's `origin` field existed —
 * inferred honestly from what's already on the profile rather than
 * defaulted blindly: isDefault means 'official', an avatarSource records
 * how it was actually made, anything else was made through the plain
 * create() form. The 'quick'/'studio' check is legacy-data-only: those
 * avatarSource modes came from the now-removed Companion Lab photo-capture
 * flow — a profile's on-disk JSON can still literally have that shape even
 * though CompanionAvatarSource no longer declares it, so this reads the
 * mode defensively instead of assuming today's narrower type.
 */
function migrateOrigin(profiles: CompanionProfile[]): CompanionProfile[] {
  return profiles.map((p) => {
    if (p.origin) return p;
    if (p.isDefault) return { ...p, origin: 'official' as const };
    if (p.avatarSource?.mode === 'upload') return { ...p, origin: 'upload' as const };
    const legacyMode = (p.avatarSource as { mode?: string } | undefined)?.mode;
    if (legacyMode === 'quick' || legacyMode === 'studio') return { ...p, origin: 'lab' as const };
    return { ...p, origin: 'manual' as const };
  });
}

function loadState(): StoredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (Array.isArray(parsed.profiles) && parsed.profiles.some((p) => p.id === DEFAULT_PAW_ID)) {
        return { ...parsed, profiles: migrateOrigin(migrateBehavior(migrateMemoryEnabled(migratePersonality(parsed.profiles)))) };
      }
    }
  } catch {
    // fall through to seed
  }

  const seeded: StoredState = { profiles: [createPawProfile()], activeId: DEFAULT_PAW_ID };
  saveState(seeded);
  return seeded;
}

function saveState(state: StoredState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.localStorage.setItem(ACTIVE_KEY, state.activeId);
}

/**
 * Local persistence for companion profiles (name/skin/voice/personality/
 * memory/relationship/preferences). Renderer-local storage, consistent
 * with the rest of this MVP (settings, auth) — not a networked backend.
 */
export class CompanionProfileStore {
  private state: StoredState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = loadState();
    // PawOS runs two BrowserWindows (main dashboard + companion overlay)
    // over the same file:// origin, each with its own module instance of
    // this store. The browser's native `storage` event fires in every OTHER
    // same-origin window when localStorage changes here — reusing it (not a
    // custom IPC channel) is what makes Companion Editor changes (voice/
    // personality/behavior/memory) made in the dashboard actually take
    // effect in the running overlay companion without an app restart.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== null && e.key !== STORAGE_KEY && e.key !== ACTIVE_KEY) return;
        this.state = loadState();
        this.notify();
      });
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private persist() {
    saveState(this.state);
    this.notify();
  }

  list(): CompanionProfile[] {
    return [...this.state.profiles];
  }

  getActive(): CompanionProfile {
    return this.state.profiles.find((p) => p.id === this.state.activeId) ?? this.state.profiles[0];
  }

  setActive(id: string) {
    if (!this.state.profiles.some((p) => p.id === id)) return;
    this.state.activeId = id;
    this.persist();
  }

  create(input: { name: string; skinId?: string; avatarImage?: string }): CompanionProfile {
    const now = Date.now();
    const profile: CompanionProfile = {
      id: uuidv4(),
      name: input.name.trim() || 'New Companion',
      skinId: input.skinId ?? 'cat',
      origin: 'manual',
      avatarImage: input.avatarImage,
      voice: { ttsProvider: 'browser' },
      personality: { preset: 'custom', traits: [], reasoningProvider: 'local' },
      behavior: createDefaultBehavior(),
      memory: { enabled: true, facts: [] },
      relationship: { interactionCount: 0, lastInteractionAt: null, toneWeights: createDefaultToneWeights() },
      preferences: { animationSpeed: 1, muted: false, enableKeyboardReactions: true, enableMouseReactions: true },
      favorite: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.profiles = [...this.state.profiles, profile];
    this.persist();
    return profile;
  }

  /** Upload Existing Companion entry point — `filePath` is the user's own original file, stored by reference only and never modified by anything downstream (see CompanionUploadPipeline.ts). */
  createFromUpload(input: { name: string; filePath: string; skinId?: string }): CompanionProfile {
    const now = Date.now();
    const avatarSource: CompanionAvatarSource = { mode: 'upload', uploadedFilePath: input.filePath };

    const profile: CompanionProfile = {
      id: uuidv4(),
      name: input.name.trim() || 'New Companion',
      skinId: input.skinId ?? 'cat',
      origin: 'upload',
      avatarSource,
      voice: { ttsProvider: 'browser' },
      personality: { preset: 'custom', traits: [], reasoningProvider: 'local' },
      behavior: createDefaultBehavior(),
      memory: { enabled: true, facts: [] },
      relationship: { interactionCount: 0, lastInteractionAt: null, toneWeights: createDefaultToneWeights() },
      preferences: { animationSpeed: 1, muted: false, enableKeyboardReactions: true, enableMouseReactions: true },
      favorite: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.profiles = [...this.state.profiles, profile];
    this.persist();
    return profile;
  }

  /** Records whether the upload turned out to already be rigged, once loadUploadedCompanion() actually runs — real telemetry, not a guess made at upload time. */
  markUploadRigged(id: string, rigged: boolean) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile?.avatarSource || profile.avatarSource.mode !== 'upload') return;
    this.update(id, () => ({ avatarSource: { ...profile.avatarSource!, rigged } as CompanionAvatarSource }));
  }

  /** Companion Package (.paw) export — maps this profile's real fields onto the package's real slots. avatarFilePath is only present when the companion has an uploaded model. */
  buildPackageInput(id: string): CompanionPackageInput | null {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return null;
    return {
      config: { name: profile.name, skinId: profile.skinId },
      voice: profile.voice,
      personality: profile.personality,
      memory: profile.memory,
      avatarFilePath: profile.avatarSource?.mode === 'upload' ? profile.avatarSource.uploadedFilePath : undefined,
      thumbnailDataUrl: profile.avatarImage,
    };
  }

  /** Companion Package (.paw) import — creates a new profile from an already-extracted package (see CompanionPackageFormat.ts's importCompanionPackage, called from main via IPC). avatarFilePath (if present) already points at a real, persisted copy under userData, not the sharer's original file. */
  createFromImportedPackage(pkg: ImportedCompanionPackage): CompanionProfile {
    const now = Date.now();
    const config = pkg.config as { name?: string; skinId?: string };
    const avatarSource: CompanionAvatarSource | undefined = pkg.avatarFilePath
      ? { mode: 'upload', uploadedFilePath: pkg.avatarFilePath }
      : undefined;

    const profile: CompanionProfile = {
      id: uuidv4(),
      name: (config.name?.trim() || 'Imported Companion'),
      skinId: config.skinId ?? 'cat',
      origin: 'imported',
      avatarImage: pkg.thumbnailDataUrl,
      avatarSource,
      voice: (pkg.voice as CompanionVoiceConfig) ?? { ttsProvider: 'browser' },
      personality: (pkg.personality as CompanionPersonality) ?? { preset: 'custom', traits: [], reasoningProvider: 'local' },
      behavior: createDefaultBehavior(),
      memory: (pkg.memory && Object.keys(pkg.memory).length > 0 ? (pkg.memory as CompanionProfile['memory']) : { enabled: true, facts: [] }),
      relationship: { interactionCount: 0, lastInteractionAt: null, toneWeights: createDefaultToneWeights() },
      preferences: { animationSpeed: 1, muted: false, enableKeyboardReactions: true, enableMouseReactions: true },
      favorite: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.profiles = [...this.state.profiles, profile];
    this.persist();
    return profile;
  }

  duplicate(id: string): CompanionProfile | null {
    const source = this.state.profiles.find((p) => p.id === id);
    if (!source) return null;
    const now = Date.now();
    const copy: CompanionProfile = {
      ...source,
      id: uuidv4(),
      name: `${source.name} copy`,
      isDefault: false,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.profiles = [...this.state.profiles, copy];
    this.persist();
    return copy;
  }

  /** Serializable export for backup/sharing. Counterpart to `import`. */
  export(id: string): string | null {
    const profile = this.state.profiles.find((p) => p.id === id);
    return profile ? JSON.stringify(profile, null, 2) : null;
  }

  import(json: string): CompanionProfile | null {
    try {
      const parsed = JSON.parse(json) as CompanionProfile;
      if (!parsed.name || !parsed.skinId) return null;
      const now = Date.now();
      const imported: CompanionProfile = {
        ...parsed,
        id: uuidv4(),
        origin: 'imported',
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
      this.state.profiles = [...this.state.profiles, imported];
      this.persist();
      return imported;
    } catch {
      return null;
    }
  }

  rename(id: string, name: string) {
    this.update(id, () => ({ name: name.trim() || 'Companion' }));
  }

  setAvatar(id: string, avatarImage: string | undefined) {
    this.update(id, () => ({ avatarImage }));
  }

  updateVoice(id: string, patch: Partial<CompanionVoiceConfig>) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.update(id, () => ({ voice: { ...profile.voice, ...patch } }));
  }

  updateBehavior(id: string, patch: Partial<CompanionBehavior>) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.update(id, () => ({ behavior: { ...profile.behavior, ...patch } }));
  }

  /** Editor's Memory Enable/Disable toggle — a client-side gate: when false, the conversation layer simply never calls record_companion_goal/record_companion_routine for this companion. Does not touch already-recorded main-process goals/routines. */
  setMemoryEnabled(id: string, enabled: boolean) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.update(id, () => ({ memory: { ...profile.memory, enabled } }));
  }

  /** Editor's Memory Reset action, local half — clears the lightweight facts/recentSummary kept on the profile itself. Callers should also invoke the resetCompanionMemory action (goals/routines in the main-process Memory Graph) alongside this. */
  resetLocalMemory(id: string) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.update(id, () => ({ memory: { ...profile.memory, facts: [], recentSummary: undefined } }));
  }

  /** Applying a named preset replaces `traits` with the preset's bundle (see PERSONALITY_PRESETS); switching to 'custom' keeps whatever traits/override are already there so nothing is silently lost. */
  updatePersonality(id: string, patch: Partial<CompanionPersonality>) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    const nextPreset = patch.preset ?? profile.personality.preset;
    const derivedTraits =
      patch.traits ?? (nextPreset !== 'custom' && nextPreset !== profile.personality.preset
        ? PERSONALITY_PRESETS[nextPreset].traits
        : profile.personality.traits);
    this.update(id, () => ({ personality: { ...profile.personality, ...patch, preset: nextPreset, traits: derivedTraits } }));
  }

  toggleFavorite(id: string) {
    const profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) return;
    this.update(id, () => ({ favorite: !profile.favorite }));
  }

  delete(id: string): boolean {
    const target = this.state.profiles.find((p) => p.id === id);
    if (!target || target.isDefault) return false;

    this.state.profiles = this.state.profiles.filter((p) => p.id !== id);
    if (this.state.activeId === id) this.state.activeId = DEFAULT_PAW_ID;
    this.persist();
    return true;
  }

  update(id: string, patch: (profile: CompanionProfile) => Partial<CompanionProfile>) {
    this.state.profiles = this.state.profiles.map((p) =>
      p.id === id ? { ...p, ...patch(p), updatedAt: Date.now() } : p
    );
    this.persist();
  }

  recordInteraction(id: string, toneSignal?: keyof CompanionProfile['relationship']['toneWeights']) {
    this.update(id, (p) => ({
      relationship: {
        interactionCount: p.relationship.interactionCount + 1,
        lastInteractionAt: Date.now(),
        toneWeights: toneSignal
          ? { ...p.relationship.toneWeights, [toneSignal]: p.relationship.toneWeights[toneSignal] + 1 }
          : p.relationship.toneWeights,
      },
    }));
  }
}

export const companionProfileStore = new CompanionProfileStore();
