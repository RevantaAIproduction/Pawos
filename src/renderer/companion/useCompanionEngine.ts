import { useMemo } from 'react';
import { useCompanionController } from './useCompanionController';
import { useConversationController } from '../conversation/useConversationController';
import type { AnimClip, Expression } from './emotion/EmotionTypes';

/**
 * The companion's backend command surface: setEmotion, playAnimation,
 * lookAt, speak, startListening, stopListening, setMood, setContext.
 * The renderer (CompanionCanvas/AnimationPlayer) only renders whatever
 * state these commands produce — it never decides behavior itself.
 *
 * This composes the existing controller + conversation hooks rather than
 * replacing them, so CompanionExperience can adopt it as a drop-in
 * replacement for its current two-hook wiring with no behavior change.
 */
export function useCompanionEngine() {
  const companion = useCompanionController();
  const conversation = useConversationController({
    onStateChange: (state) => companion.controller?.setConversationState(state),
  });

  return useMemo(
    () => ({
      companion,
      conversation,

      setEmotion: (expression: Expression) => companion.controller?.setEmotion(expression),
      playAnimation: (clip: AnimClip) => companion.controller?.playAnimation(clip),
      lookAt: (target: { x: number; y: number } | null) => companion.controller?.lookAt(target),
      speak: (text: string) => conversation.speak(text),
      startListening: () => conversation.open(),
      stopListening: () => conversation.close(),
      setMood: (mood: string) => companion.controller?.setMood(mood),
      setContext: (context: Record<string, unknown>) => companion.controller?.setContext(context),
      getEmotion: () => companion.controller?.getEmotion(),
    }),
    [companion, conversation]
  );
}
