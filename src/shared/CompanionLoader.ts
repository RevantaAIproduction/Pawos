import type { CompanionConfig } from '../renderer/companion/CompanionDefinition';

export type SerializedCompanion = {
  id: string;
  name: string;
  bodySize: CompanionConfig['bodySize'];
  animations: any;
  physics?: { mass?: number; restitution?: number; speed?: number; ballChase?: number };
};

export type CompanionDefinition = {
  id: string;
  name: string;
  bodySize: CompanionConfig['bodySize'];
  animations: any;
  physics: { mass: number; restitution: number; speed: number; ballChase: number };
};

type PetSummary = { id: string; name: string };

function readJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class CompanionLoader {
  // baseDir is resolved by the caller (see src/main/assets/AssetPathResolver.ts
  // getPetsDir()) rather than guessed here, since dev vs packaged asset
  // layout can't be told apart without an electron import — keeping this
  // shared module free of that dependency.
  static async listCompanions(baseDir: string): Promise<PetSummary[]> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');

    let petIds: string[] = [];
    try {
      petIds = fs
        .readdirSync(baseDir)
        .filter((entry: string) => {
          try {
            return fs.statSync(`${baseDir}/${entry}`).isDirectory();
          } catch {
            return false;
          }
        });
    } catch {
      return [];
    }

    const results: PetSummary[] = [];
    for (const id of petIds) {
      const metaPath = `${baseDir}/${id}/pet.json`;
      try {
        const raw = fs.readFileSync(metaPath, 'utf8');
        const meta = readJsonSafe<{ id?: string; name?: string }>(raw);
        if (meta?.id && meta?.name) {
          results.push({ id: meta.id, name: meta.name });
        } else {
          // Fallback to id as name
          results.push({ id, name: id });
        }
      } catch {
        // ignore missing pet.json
      }
    }
    return results;
  }

  static async loadCompanion(id: string, baseDir: string): Promise<CompanionDefinition> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');

    const metaPath = `${baseDir}/${id}/pet.json`;
    const raw = fs.readFileSync(metaPath, 'utf8');
    const serialized = readJsonSafe<SerializedCompanion>(raw);
    if (!serialized) throw new Error(`Failed to load pet json for ${id}`);

    return {
      id: serialized.id,
      name: serialized.name,
      bodySize: serialized.bodySize,
      animations: serialized.animations,
      physics: {
        mass: serialized.physics?.mass ?? 1,
        restitution: serialized.physics?.restitution ?? 0.6,
        speed: serialized.physics?.speed ?? 160,
        ballChase: serialized.physics?.ballChase ?? 250,
      },
    };
  }
}

export { CompanionLoader as PetLoader };

