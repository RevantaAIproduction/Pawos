import type React from 'react';
import type { ConversationState } from '../../../conversation/ConversationTypes';
import type { VisemeFrame } from '../../../conversation/LipSyncTypes';
import type { StateRequester } from '../CompanionRuntime';
import type { CompanionState, CompanionSubsystem, RuntimeContext } from '../CompanionStates';

const FALLBACK_MOUTH_FLAP_HZ = 3.2;

/**
 * Bridges the real conversation runtime (STT/TTS state + viseme frames)
 * into CompanionRuntime. Voice always outranks idle-life scheduling — see
 * CompanionRuntime.setVoiceRequester(). Also drives the mouth shape each
 * frame (ported from the old applyMouth() closure in Avatar3DOverlay):
 * real viseme frames when a viseme-capable TTS provider is active, else a
 * believable flap-fallback that's honestly distinct from real lip-sync.
 *
 * No wake-word / always-on command listening exists yet — `conversationStateRef`
 * only changes once the user has explicitly opened the conversation panel.
 * That's a real, current gap, not something this class pretends to solve.
 */
export class VoiceController implements CompanionSubsystem, StateRequester {
  private lastVisemeFrame: VisemeFrame | null = null;
  private elapsedSeconds = 0;

  constructor(
    private conversationStateRef: React.RefObject<ConversationState>,
    private isSpeakingRef: React.RefObject<boolean> | undefined,
    private visemeRef: React.RefObject<VisemeFrame | null> | undefined,
    private onActivity: () => void
  ) {}

  desiredState(_now: number, _current: CompanionState): CompanionState | null {
    switch (this.conversationStateRef.current) {
      case 'speaking':
        return 'talking';
      case 'thinking':
        return 'thinking';
      case 'performingAction':
        // Distinct from 'thinking' — the real 'typing' clip (already in the
        // library, mapped in AnimationController's STATE_TO_CLIP) reads as
        // "actively doing something" rather than passively reasoning.
        return 'typing';
      case 'listening':
      case 'transcribing':
      case 'interrupted':
        // Interrupted is a one-tick transitional state on the way to
        // listening — mapping it there too avoids any visible animation jump.
        return 'listening';
      default:
        return null;
    }
  }

  update(deltaSeconds: number, ctx: RuntimeContext): void {
    const cs = this.conversationStateRef.current;
    if (cs && cs !== 'idle') this.onActivity();

    this.elapsedSeconds += deltaSeconds;
    const speaking = this.isSpeakingRef?.current ?? cs === 'speaking';
    if (!speaking) {
      this.lastVisemeFrame = null;
      ctx.anim.setViseme('sil', 0);
      return;
    }

    const frame = this.visemeRef?.current ?? null;
    if (frame && frame !== this.lastVisemeFrame) {
      this.lastVisemeFrame = frame;
      ctx.anim.setViseme(frame.viseme, frame.weight);
      return;
    }
    if (frame) return; // real viseme data flowing; hold the current shape between frames.

    const phase = (Math.sin(this.elapsedSeconds * Math.PI * 2 * FALLBACK_MOUTH_FLAP_HZ) + 1) / 2;
    ctx.anim.setViseme(phase > 0.55 ? 'aa' : 'sil', phase);
  }
}
