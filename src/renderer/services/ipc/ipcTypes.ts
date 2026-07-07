export type SettingsState = {
  selectedPetId: string;
  animationSpeed: number;
  soundVolume: number;
  startWithWindows: boolean;
  enableKeyboardReactions: boolean;
  enableMouseReactions: boolean;
  muted: boolean;
};

export type PetInfo = { id: string; name: string };

