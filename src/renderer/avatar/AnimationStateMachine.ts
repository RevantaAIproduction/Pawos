import * as THREE from 'three';
import type { AnimationManager } from './AnimationManager';
import type { AnimationName } from './AnimationLibrary';

export type AnimationEvent = { type: 'start' | 'end' | 'stop'; name: AnimationName | null };
export type AnimationEventListener = (event: AnimationEvent) => void;

const DEFAULT_CROSSFADE_MS = 350;

/**
 * Tracks current/queued animation, drives crossfades, and auto-advances
 * one-shot clips: to the next queued clip if any, otherwise back to the
 * idle default. Looping vs one-shot is decided once in AnimationLibrary
 * (LOOPING_ANIMATIONS) and enforced by AnimationManager; this class only
 * reacts to the mixer's 'finished' event for one-shot clips.
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

  /** Interrupts whatever is playing/queued and plays `name` immediately. */
  play(name: AnimationName, crossFadeMs: number = DEFAULT_CROSSFADE_MS) {
    this.queue = [];
    this.transitionTo(name, crossFadeMs);
  }

  /** Same as play(), named to match the documented API for explicit blend control. */
  crossFade(name: AnimationName, durationMs: number = DEFAULT_CROSSFADE_MS) {
    this.transitionTo(name, durationMs);
  }

  /** Appends to the queue; plays immediately if nothing is currently active. */
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
