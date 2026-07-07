import type { AssetDescriptor } from '../companion/CompanionDefinition';

export type GifAsset = { kind: 'gif'; src: string };
export type PngSequenceAsset = { kind: 'pngSequence'; src: string; frameCount: number; frameDurationMs?: number; frameWidth?: number; frameHeight?: number };
export type WebpSequenceAsset = { kind: 'webpSequence'; src: string; frameCount: number; frameDurationMs?: number; frameWidth?: number; frameHeight?: number };
export type SpriteSheetAsset = { kind: 'spriteSheet'; src: string; frameWidth: number; frameHeight: number; frameCount: number; frameDurationMs?: number };

export type AnyAsset =
  | GifAsset
  | PngSequenceAsset
  | WebpSequenceAsset
  | SpriteSheetAsset;

export function descriptorToAsset(desc: AssetDescriptor): AnyAsset {
  switch (desc.kind) {
    case 'gif':
      return { kind: 'gif', src: desc.src };
    case 'pngSequence':
      if (!desc.frameCount) throw new Error('pngSequence requires frameCount');
      return {
        kind: 'pngSequence',
        src: desc.src,
        frameCount: desc.frameCount,
        frameDurationMs: desc.frameDurationMs,
        frameWidth: desc.frameWidth,
        frameHeight: desc.frameHeight,
      };
    case 'webpSequence':
      if (!desc.frameCount) throw new Error('webpSequence requires frameCount');
      return {
        kind: 'webpSequence',
        src: desc.src,
        frameCount: desc.frameCount,
        frameDurationMs: desc.frameDurationMs,
        frameWidth: desc.frameWidth,
        frameHeight: desc.frameHeight,
      };
    case 'spriteSheet':
      if (!desc.frameWidth || !desc.frameHeight || !desc.frameCount) throw new Error('spriteSheet requires frameWidth/frameHeight/frameCount');
      return {
        kind: 'spriteSheet',
        src: desc.src,
        frameWidth: desc.frameWidth,
        frameHeight: desc.frameHeight,
        frameCount: desc.frameCount,
        frameDurationMs: desc.frameDurationMs,
      };
    default:
      return { kind: 'gif', src: desc.src };
  }
}

