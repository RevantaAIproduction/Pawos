import type { PetAnimationsConfig } from '../companion/CompanionDefinition';
import { descriptorToAsset, type AnyAsset } from './assetTypes';

export type AnimationName = keyof PetAnimationsConfig;

type LoadedGif = { img: HTMLImageElement; ready: boolean };

export type LoadedAssets = {
  // frames are drawn by the player; we store preloaded images where applicable
  framesByAssetKey: Map<string, HTMLImageElement[]>;
  gifByAssetKey: Map<string, LoadedGif>;
};

export class AnimationPlayer {
  private assets: LoadedAssets = {
    framesByAssetKey: new Map(),
    gifByAssetKey: new Map(),
  };

  private current: AnimationName;
  private frameIndex = 0;
  private timeInStateMs = 0;

  private animToDesc: Record<string, AnyAsset> = {};

  private ready = false;

  constructor(private animations: PetAnimationsConfig) {
    this.current = 'idle';
    this.prebuild();
  }

  private prebuild() {
    for (const [name, desc] of Object.entries(this.animations)) {
      this.animToDesc[name] = descriptorToAsset(desc);
    }
  }

  async loadAll(resourceBaseUrl: string) {
    const promises: Promise<void>[] = [];
    for (const [name, asset] of Object.entries(this.animToDesc)) {
      const key = String(name);
      promises.push(this.loadAsset(resourceBaseUrl, key, asset));
    }
    await Promise.all(promises);
    this.ready = true;
  }

  private async loadAsset(base: string, key: string, asset: AnyAsset) {
    const full = (rel: string) => (rel.startsWith('http') ? rel : `${base}/${rel}`);

    if (asset.kind === 'gif') {
      const img = new Image();
      img.decoding = 'async';
      img.src = full(asset.src);
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      });
      this.assets.gifByAssetKey.set(key, { img, ready: loaded });
      return;
    }

    if (asset.kind === 'pngSequence' || asset.kind === 'webpSequence') {
      const frames: HTMLImageElement[] = [];
      const pArr: Promise<void>[] = [];
      for (let i = 0; i < asset.frameCount; i++) {
        const frameName = `${asset.src.replace(/\.(png|webp)$/i, '')}_${String(i).padStart(4, '0')}.${asset.kind === 'pngSequence' ? 'png' : 'webp'}`;
        const img = new Image();
        img.decoding = 'async';
        img.src = full(frameName);
        frames.push(img);
        pArr.push(
          new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
        );
      }
      await Promise.all(pArr);
      this.assets.framesByAssetKey.set(key, frames);
      return;
    }

    if (asset.kind === 'spriteSheet') {
      const img = new Image();
      img.decoding = 'async';
      img.src = full(asset.src);
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      // store single image; player will compute UVs
      this.assets.framesByAssetKey.set(key, [img]);
    }
  }

  isReady() {
    return this.ready;
  }

  setAnimation(name: AnimationName) {
    if (this.current === name) return;
    this.current = name;
    this.frameIndex = 0;
    this.timeInStateMs = 0;
  }

  update(dtMs: number) {
    if (!this.ready) return;
    this.timeInStateMs += dtMs;

    const asset = this.animToDesc[this.current as string];
    if (asset.kind === 'gif') {
      // GIF advances internally with browser; no manual frame stepping.
      return;
    }

    const duration = asset.frameDurationMs ?? 90;
    const frameCount = asset.kind === 'spriteSheet' ? asset.frameCount : asset.frameCount;

    const nextIndex = Math.floor(this.timeInStateMs / duration) % frameCount;
    this.frameIndex = nextIndex;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, size: { width: number; height: number }, rotationRad: number) {
    if (!this.ready) return;

    const asset = this.animToDesc[this.current as string];
    if (!asset) return;

    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(rotationRad);

    const w = size.width;
    const h = size.height;

    if (asset.kind === 'gif') {
      const gif = this.assets.gifByAssetKey.get(this.current as string);
      if (gif?.ready) ctx.drawImage(gif.img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    if (asset.kind === 'pngSequence' || asset.kind === 'webpSequence') {
      const frames = this.assets.framesByAssetKey.get(this.current as string) ?? [];
      const img = frames[this.frameIndex];
      if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    if (asset.kind === 'spriteSheet') {
      const sheet = this.assets.framesByAssetKey.get(this.current as string)?.[0];
      if (sheet) {
        const cols = Math.max(1, Math.floor(sheet.width / asset.frameWidth));
        const sx = (this.frameIndex % cols) * asset.frameWidth;
        const sy = Math.floor(this.frameIndex / cols) * asset.frameHeight;

        ctx.drawImage(
          sheet,
          sx,
          sy,
          asset.frameWidth,
          asset.frameHeight,
          -w / 2,
          -h / 2,
          w,
          h
        );
      }
      ctx.restore();
    }
  }
}

