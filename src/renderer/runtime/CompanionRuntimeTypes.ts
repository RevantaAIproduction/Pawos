import type { CompanionDefinition } from '../companion/CompanionDefinition';

export type CompanionRuntime = {
  pet: CompanionDefinition;
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
};

export type PetRuntime = CompanionRuntime;

