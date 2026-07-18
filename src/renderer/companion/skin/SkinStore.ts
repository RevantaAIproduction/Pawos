import { v4 as uuidv4 } from 'uuid';
import { createDefaultSkin, type SkinDescriptor } from './SkinTypes';

const STORAGE_KEY = 'pawos:skins:v1';
const ACTIVE_KEY = 'pawos:skins:active';

type StoredState = { skins: SkinDescriptor[]; activeId: string };

function load(): StoredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (Array.isArray(parsed.skins) && parsed.skins.length > 0) return parsed;
    }
  } catch {
    // fall through to seed
  }
  const seeded = { skins: [createDefaultSkin()], activeId: 'skin-default-cat' };
  save(seeded);
  return seeded;
}

function save(state: StoredState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.localStorage.setItem(ACTIVE_KEY, state.activeId);
}

/** Local persistence for companion skins (appearance descriptors). */
export class SkinStore {
  private state = load();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist() {
    save(this.state);
    this.listeners.forEach((l) => l());
  }

  list(): SkinDescriptor[] {
    return [...this.state.skins];
  }

  getActive(): SkinDescriptor {
    return this.state.skins.find((s) => s.id === this.state.activeId) ?? this.state.skins[0];
  }

  setActive(id: string) {
    if (!this.state.skins.some((s) => s.id === id)) return;
    this.state.activeId = id;
    this.persist();
  }

  create(input: Omit<SkinDescriptor, 'id' | 'isBuiltIn' | 'createdAt'>): SkinDescriptor {
    const skin: SkinDescriptor = { ...input, id: uuidv4(), isBuiltIn: false, createdAt: Date.now() };
    this.state.skins = [...this.state.skins, skin];
    this.persist();
    return skin;
  }

  export(id: string): string | null {
    const skin = this.state.skins.find((s) => s.id === id);
    return skin ? JSON.stringify(skin, null, 2) : null;
  }

  import(json: string): SkinDescriptor | null {
    try {
      const parsed = JSON.parse(json) as SkinDescriptor;
      if (!parsed.name || !parsed.petId) return null;
      const skin: SkinDescriptor = { ...parsed, id: uuidv4(), isBuiltIn: false, createdAt: Date.now() };
      this.state.skins = [...this.state.skins, skin];
      this.persist();
      return skin;
    } catch {
      return null;
    }
  }

  delete(id: string): boolean {
    const target = this.state.skins.find((s) => s.id === id);
    if (!target || target.isBuiltIn) return false;
    this.state.skins = this.state.skins.filter((s) => s.id !== id);
    if (this.state.activeId === id) this.state.activeId = 'skin-default-cat';
    this.persist();
    return true;
  }
}

export const skinStore = new SkinStore();
