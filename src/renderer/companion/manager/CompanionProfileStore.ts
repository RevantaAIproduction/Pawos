import { v4 as uuidv4 } from 'uuid';
import {
  createDefaultToneWeights,
  createPawProfile,
  DEFAULT_PAW_ID,
  type CompanionAvatarSource,
  type CompanionPhoto,
  type CompanionProfile,
} from './CompanionProfileTypes';

const STORAGE_KEY = 'pawos:companions:v1';
const ACTIVE_KEY = 'pawos:companions:active';

type StoredState = {
  profiles: CompanionProfile[];
  activeId: string;
};

function loadState(): StoredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (Array.isArray(parsed.profiles) && parsed.profiles.some((p) => p.id === DEFAULT_PAW_ID)) {
        return parsed;
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
      avatarImage: input.avatarImage,
      voice: { ttsProvider: 'browser' },
      personality: { traits: [], reasoningProvider: 'local' },
      memory: { facts: [] },
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

  /** Companion Lab entry point: creates a profile from a captured photo set (Quick or Studio create). */
  createFromLab(input: { name: string; mode: 'quick' | 'studio'; photos: CompanionPhoto[]; skinId?: string }): CompanionProfile {
    const now = Date.now();
    const frontPhoto = input.photos.find((p) => p.angle === 'front');
    const avatarSource: CompanionAvatarSource = {
      mode: input.mode,
      photos: input.photos,
      generationStatus: 'not-started',
    };

    const profile: CompanionProfile = {
      id: uuidv4(),
      name: input.name.trim() || 'New Companion',
      skinId: input.skinId ?? 'cat',
      avatarImage: frontPhoto?.dataUrl,
      avatarSource,
      voice: { ttsProvider: 'browser' },
      personality: { traits: [], reasoningProvider: 'local' },
      memory: { facts: [] },
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
