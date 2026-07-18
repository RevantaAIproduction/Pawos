import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CompanionController } from '../../companion/CompanionController';
import { CompanionAnimationController } from '../../avatar/CompanionAnimationController';
import { CompanionRuntime } from '../../companion/core/CompanionRuntime';
import type { RuntimeContext } from '../../companion/core/CompanionStates';
import { AnimationController } from '../../companion/core/controllers/AnimationController';
import { ActionController } from '../../companion/core/controllers/ActionController';
import { EmotionController } from '../../companion/core/controllers/EmotionController';
import { FacialController } from '../../companion/core/controllers/FacialController';
import { VoiceController } from '../../companion/core/controllers/VoiceController';
import { cursorAngleFromCenter } from '../../avatar/BodyLookYaw';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import type { VisemeFrame } from '../../conversation/LipSyncTypes';
import type { ConversationState } from '../../conversation/ConversationTypes';
import styles from './companionCanvas.module.css';

/**
 * Thin renderer: owns the THREE.js scene/camera/mesh and the real
 * conversation/mouse inputs, then hands everything to CompanionRuntime,
 * which is the single place that decides what the companion is doing
 * (idle/walking/listening/thinking/talking/typing/celebrating/sleeping/
 * greeting/sitting/jumping/disabled) and drives every controller
 * (Animation, Emotion, Facial, Voice, Action) off of that. See
 * src/renderer/companion/core/ for the runtime itself — this component no
 * longer decides behavior, it just wires real inputs in and renders.
 */
export function Avatar3DOverlay({
  controller,
  visemeRef,
  isSpeakingRef,
  conversationStateRef,
  workspaceActiveRef,
  celebrateUntilRef,
}: {
  controller: CompanionController | null;
  /** Latest lip-sync frame from a viseme-capable TTS provider (e.g. ElevenLabs) — null when none has arrived yet. */
  visemeRef?: React.RefObject<VisemeFrame | null>;
  /** Whether the conversation runtime is currently in the 'speaking' state. */
  isSpeakingRef?: React.RefObject<boolean>;
  /** The real conversation state (idle/listening/transcribing/thinking/speaking/...) — drives Listening/Thinking/Talking directly, bypassing the legacy 2D emotion pipeline. */
  conversationStateRef?: React.RefObject<ConversationState>;
  /** Whether the Workspace Runtime is currently showing an active task — hints the companion toward 'sitting' near it, below real foreground-app docking, above idle wandering. */
  workspaceActiveRef?: React.RefObject<boolean>;
  /** Future timestamp (Date.now() + duration) until which the companion celebrates — set once by CompanionExperience.tsx the moment a task completes. */
  celebrateUntilRef?: React.RefObject<number>;
}) {
  const ipc = useIpcBridge();
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 280;
    const height = mount.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.3, 3.2);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(1.5, 3, 2);
    scene.add(dirLight);

    const animController = new CompanionAnimationController(
      () => ipc.getAnimationsBaseUrl(),
      () => ipc.getCharactersBaseUrl()
    );

    let disposed = false;
    const fallbackConversationStateRef: React.RefObject<ConversationState> = { current: 'idle' };
    const csRef = conversationStateRef ?? fallbackConversationStateRef;

    let runtime: CompanionRuntime | null = null;
    let actionController: ActionController | null = null;
    let animationController: AnimationController | null = null;

    animController.whenReady().then(() => {
      if (disposed || !animController.root) return;
      scene.add(animController.root);
      if (animController.faceOverlayMesh) scene.add(animController.faceOverlayMesh);

      // The mount div (.avatar3d) fills its parent (.avatarShell) exactly
      // via inset:0 — .avatarShell itself is a fixed 280x280 box anchored
      // bottom-left with 20px padding inside the much-wider overlay window
      // (app.module.css), so this rect is exactly where the character is
      // actually visible within the window.
      const visibleRect = mount.getBoundingClientRect();
      const ctx: RuntimeContext = {
        anim: animController,
        camera,
        ipc: {
          moveOverlayWindow: ipc.moveOverlayWindow,
          getOverlayWindowBounds: ipc.getOverlayWindowBounds,
          getScreenWorkArea: ipc.getScreenWorkArea,
          getForegroundWindowInfo: ipc.getForegroundWindowInfo,
        },
        visibleBoxOffset: { x: visibleRect.x, width: visibleRect.width },
      };

      runtime = new CompanionRuntime(ctx);
      animationController = new AnimationController(ctx);
      actionController = new ActionController(animationController, workspaceActiveRef, celebrateUntilRef);
      const emotionController = new EmotionController(() => controller?.getEmotion()?.primary ?? null);
      const facialController = new FacialController(emotionController);
      const voiceController = new VoiceController(csRef, isSpeakingRef, visemeRef, () =>
        actionController?.notifyInteraction()
      );

      runtime.register(animationController);
      runtime.register(emotionController);
      runtime.register(facialController);
      runtime.register(voiceController);
      runtime.register(actionController);
      runtime.setVoiceRequester(voiceController);
      runtime.setActionRequester(actionController);

      // Greet once, the moment the companion first appears.
      runtime.performGesture('greeting');
    });

    const clock = new THREE.Clock();
    let frameId: number;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      runtime?.update(delta);
      renderer.render(scene, camera);
    };
    tick();

    const handleResize = () => {
      const w = mount.clientWidth || 280;
      const h = mount.clientHeight || 280;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Eyes follow the cursor whenever it's over the companion overlay (a
    // subtle head tilt via ProceduralMotion), AND the whole body turns to
    // face wherever the cursor is — its angle around the window center maps
    // directly to facing direction, so moving the cursor in a full circle
    // sweeps the body through a full 360°, not just a small head wobble.
    // Both count as interaction for the idle/sleepy timer; both recenter on leave.
    const handleMouseMove = (e: MouseEvent) => {
      actionController?.notifyInteraction();
      const rect = mount.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      animController.setLookAt({ x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) });
      animationController?.setCursorLookYaw(cursorAngleFromCenter(e.clientX, e.clientY, rect));
    };
    const handleMouseLeave = () => {
      animController.setLookAt(null);
      animationController?.setCursorLookYaw(null);
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseout', handleMouseLeave);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseLeave);
      cancelAnimationFrame(frameId);
      animController.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [ipc, controller]);

  return <div ref={mountRef} className={styles.avatar3d} />;
}
