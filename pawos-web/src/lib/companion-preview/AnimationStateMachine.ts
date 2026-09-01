import * as THREE from 'three';
import type { AnimationManager } from './AnimationManager';
import type { AnimationName } from './AnimationLibrary';

export type AnimationEvent = { type: 'start' | 'end' | 'stop'; name: AnimationName | null };
export type AnimationEventListener = (event: AnimationEvent) => void;

const DEFAULT_CROSSFADE_MS = 350;

/**
 * Direct port of the desktop app's AnimationStateMachine
 * (src/renderer/avatar/AnimationStateMachine.ts) — unchanged. Tracks
 * current/queued animation, drives crossfades, and auto-advances one-shot
 * clips back to the idle default.
 */
export class AnimationStateMachine {
  private current: AnimationName | null = null;
  private queue: AnimationName[] = [];
  private listeners = new Set<AnimationEventListener>();
  private onFinished = (event: { action: THREE.AnimationAction }) => this.handleFinished(event.action);

  constructor(
    private manager: AnimationManager,
    private defaultName: AnimationName
  ) {
    this.manager.mixer.addEventListener('finished', this.onFinished as any);
  }

  getCurrent(): AnimationName | null {
    return this.current;
  }

  getQueue(): AnimationName[] {
    return [...this.queue];
  }

  on(listener: AnimationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(name: AnimationName, crossFadeMs: number = DEFAULT_CROSSFADE_MS) {
    this.queue = [];
    this.transitionTo(name, crossFadeMs);
  }

  crossFade(name: AnimationName, durationMs: number = DEFAULT_CROSSFADE_MS) {
    this.transitionTo(name, durationMs);
  }

  queueAnimation(name: AnimationName) {
    if (!this.current) {
      this.transitionTo(name, DEFAULT_CROSSFADE_MS);
      return;
    }
    this.queue.push(name);
  }

  stop() {
    this.queue = [];
    const stoppedName = this.current;
    if (stoppedName) {
      this.manager.getAction(stoppedName)?.fadeOut(0.15);
    }
    this.current = null;
    this.emit({ type: 'stop', name: stoppedName });
  }

  dispose() {
    this.manager.mixer.removeEventListener('finished', this.onFinished as any);
    this.listeners.clear();
  }

  private transitionTo(name: AnimationName, durationMs: number) {
    const next = this.manager.getAction(name);
    if (!next) return;

    const prevName = this.current;
    const prev = prevName ? this.manager.getAction(prevName) : undefined;

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();

    if (prev && prev !== next) {
      prev.crossFadeTo(next, durationMs / 1000, true);
    }

    this.current = name;
    this.emit({ type: 'start', name });
  }

  private handleFinished(action: THREE.AnimationAction) {
    const finishedName = this.manager.getNameForAction(action);
    if (!finishedName || finishedName !== this.current) return;

    this.emit({ type: 'end', name: finishedName });

    if (this.queue.length > 0) {
      const nextName = this.queue.shift()!;
      this.transitionTo(nextName, DEFAULT_CROSSFADE_MS);
    } else if (finishedName !== this.defaultName) {
      this.transitionTo(this.defaultName, DEFAULT_CROSSFADE_MS + 50);
    }
  }

  private emit(event: AnimationEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}
