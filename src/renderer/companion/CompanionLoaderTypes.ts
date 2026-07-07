import type { CompanionAnimationsConfig, CompanionConfig } from '../CompanionDefinition';

export type SerializedCompanion = {
  id: string;
  name: string;
  bodySize: CompanionConfig['bodySize'];
  animations: CompanionAnimationsConfig;
  physics?: { mass?: number; restitution?: number; speed?: number; ballChase?: number };
};

export type CompanionDefinition = {
  id: string;
  name: string;
  bodySize: CompanionConfig['bodySize'];
  animations: CompanionAnimationsConfig;
  physics: { mass: number; restitution: number; speed: number; ballChase: number };
};

export type SerializedPet = SerializedCompanion;
export type PetDefinition = CompanionDefinition;

