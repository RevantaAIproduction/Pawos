export class AudioManager {
  private muted = false;
  private volume = 0.6;

  setMuted(m: boolean) {
    this.muted = m;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  async play(_key: 'eat' | 'jump' | 'sleep' | 'celebrate') {
    if (this.muted) return;
    // MVP: stub (no external audio). Future: load from assets.
  }
}

