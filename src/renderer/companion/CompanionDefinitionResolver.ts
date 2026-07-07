import type { SerializedCompanion, CompanionDefinition } from './CompanionLoaderTypes';

export class CompanionDefinitionResolver {
  fromSerialized(serialized: SerializedCompanion): CompanionDefinition {
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

export { CompanionDefinitionResolver as PetDefinitionResolver };

