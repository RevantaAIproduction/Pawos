import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { CompanionDefinition, SerializedCompanion } from './CompanionLoaderTypes';
import { CompanionDefinitionNormalizer } from './CompanionDefinitionNormalizer';
import { CompanionDefinitionResolver } from './CompanionDefinitionResolver';
import type { CompanionConfig } from './CompanionDefinition';

export class CompanionLoader {
  static async listCompanions() {
    // Main process lists
    const list = await ipc.petsList();
    return list;
  }

  static async loadCompanion(petId: string): Promise<CompanionDefinition> {
    const serialized: SerializedCompanion = await ipc.petsLoad(petId);
    const cfg = new CompanionDefinitionResolver().fromSerialized(serialized);
    return cfg;
  }
}

export { CompanionLoader as PetLoader };

// Types used by loader

