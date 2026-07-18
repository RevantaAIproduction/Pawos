/**
 * A skin is purely a data + asset reference — never runtime code. It points
 * at a pet definition (CompanionLoader already resolves any petId to its
 * pet.json + animation assets dynamically) plus cosmetic overlays. Adding a
 * new skin — including a future user-uploaded avatar — means adding a
 * SkinDescriptor and asset folder, never touching AnimationPlayer,
 * CompanionApp, CompanionAnimationFsmController, or CompanionBrain.
 */
export type SkinDescriptor = {
  id: string;
  name: string;
  /** References a CompanionLoader pet definition id (e.g. 'cat'). */
  petId: string;
  outfit?: string;
  accessories: string[];
  glow: { enabled: boolean; color: string };
  colors: Record<string, string>;
  isBuiltIn: boolean;
  createdAt: number;
};

export function createDefaultSkin(): SkinDescriptor {
  return {
    id: 'skin-default-cat',
    name: 'Classic Paw',
    petId: 'cat',
    accessories: [],
    glow: { enabled: false, color: '#8b7bff' },
    colors: {},
    isBuiltIn: true,
    createdAt: Date.now(),
  };
}
