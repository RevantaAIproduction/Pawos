export type AssetDescriptor = {
  kind:
    | 'gif'
    | 'pngSequence'
    | 'webpSequence'
    | 'spriteSheet'
    | 'unknown';
  src: string; // relative to assets/pets/{petId}/assets...
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameDurationMs?: number;
};

export type CompanionAnimationsConfig = {
  idle: AssetDescriptor;
  walking: AssetDescriptor;
  running: AssetDescriptor;
  sleeping: AssetDescriptor;
  typing: AssetDescriptor;
  eating: AssetDescriptor;
  jumping: AssetDescriptor;
  spinning: AssetDescriptor;
  catchBall: AssetDescriptor;
  happy: AssetDescriptor;
  celebrate: AssetDescriptor;
};

export type CompanionConfig = {
  id: string;
  name: string;
  // size used for physics/collision; renderer can scale sprites to fit
  bodySize: { width: number; height: number };
  animations: CompanionAnimationsConfig;
  // optional tuning
  mass?: number;
  restitution?: number;
  speed?: number;
  ballChase?: number;
};

export type PetAnimationsConfig = CompanionAnimationsConfig;
export type PetConfig = CompanionConfig;

