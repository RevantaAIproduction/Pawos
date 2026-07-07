import type { SettingsState } from '../services/settings/SettingsManager';
import { KeyboardHook } from '../inputs/KeyboardHook';
import { MouseHook } from '../inputs/MouseHook';
import { CompanionLoader } from './CompanionLoader';
import type { CompanionRuntime } from '../runtime/CompanionRuntimeTypes';

import { CompanionApp } from '../runtime/CompanionApp';
import { getCompanionResourceBaseUrl } from './CompanionAssetResolver';

import { RendererActivityProvider as RendererActivityProviderImpl } from '../activity/RendererActivityProvider';
import { CompanionRuntimeHost } from './CompanionRuntimeHost';
import { createCompanionRuntimeHostLoop } from './CompanionRuntimeHostLoop';


export type CompanionController = {
  attachCanvas: (canvas: HTMLCanvasElement, wrap: HTMLDivElement) => void;
  detachCanvas: () => void;
  applySettings: (s: SettingsState) => void;
  setConversationState: (state: import('../conversation/ConversationTypes').ConversationState) => void;
  setConversationPanelOpen: (open: boolean) => void;
};

export function createCompanionController(args: {
  // Bundle-relative base used by AnimationPlayer to resolve pet assets.
  // For now we assume dev/prod serve /assets as static.
  resourceBaseUrl: string;
}): CompanionController {
  let app: CompanionApp | null = null;
  let wrapEl: HTMLDivElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;

  let currentSettings: SettingsState | null = null;
  let conversationPanelOpen = false;
  let conversationState: import('../conversation/ConversationTypes').ConversationState = 'idle';

  // Companion runtime host (Activity→Context→Mood→Behavior)
  // We create it lazily after CompanionApp init, because FSM controller lives there.
  let runtimeHost: CompanionRuntimeHost | null = null;
  let runtimeLoop: ReturnType<typeof createCompanionRuntimeHostLoop> | null = null;

  // input hooks - attach once while canvas attached
  const keyboardHook = new KeyboardHook({
    // runtime idle detector reacts to any input
    // and fsm transitions depend on specific hooks.
    } as any);

  const mouseHook = new MouseHook({} as any);


  // Implement handler with actual runtime calls once initialized.
  // We keep stable closures.

  const onKeyboard = (evt: {
    key: string;
    code?: string;
    meta?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    type: 'down' | 'up';
    repeat?: boolean;
  }) => {
    if (!app || conversationPanelOpen) return;

    // only down events
    if (evt.type !== 'down') return;

    app.onKeyboardInput();

    const key = evt.key.toLowerCase();
    switch (key) {
      case 't':
        app.onTreat();
        break;
      case 'b':
        app.onBall();
        break;
      case 's':
        app.onSpin();
        break;
      case 'c':
        app.onCelebrate();
        break;
      case 'h':
        app.onSalute();
        break;
      case 'p':
        app.onPickUp();
        break;
      case 'd':
        app.onDrop();
        break;
      case 'j':
        app.onEscapeJump();
        break;
      case 'enter':
        app.onBackspacePlayful();
        break;
      case 'escape':
        app.onEscapeJump();
        break;
      default:
        break;
    }
  };

  const onMouse = (evt: {
    x: number;
    y: number;
    leftDown: boolean;
    rightDown: boolean;
    type: 'move' | 'down' | 'up';
    dx: number;
    dy: number;
    dtMs: number;
  }) => {
    if (!app || conversationPanelOpen) return;

    const movedQuickly = evt.dtMs > 0 ? Math.hypot(evt.dx, evt.dy) / evt.dtMs > 0.4 : false;
    // CompanionApp expects pointer vx/vy.
    const vx = evt.dx;
    const vy = evt.dy;

    app.onPointerMove(evt.x, evt.y, vx, vy, movedQuickly);

    if (evt.type === 'down') {
      if (evt.leftDown) app.onPointerLeftClick();
      if (evt.rightDown) app.onPointerRightClick();
    }
  };

  // Recreate hooks with correct handler after controller creation.
  // (KeyboardHook/MouseHook are classes; we instantiate them here.)

  let keyboard = new KeyboardHook(onKeyboard);
  let mouse = new MouseHook(onMouse);

  const detachHooks = () => {
    try {
      keyboard.stop();
      mouse.stop();
    } catch {
      // ignore
    }
  };

  const stopRuntime = () => {
    try {
      runtimeLoop?.stop();
    } catch {
      // ignore
    }
    runtimeLoop = null;
    runtimeHost = null;
  };

  const loadPetAndStart = async () => {
    if (!canvasEl || !wrapEl) return;
    const s = currentSettings ?? ({} as SettingsState);

    // Resolve pet definition from main process.
    const petId = s.selectedPetId ?? 'cat';
    const petDef = await CompanionLoader.loadCompanion(petId);

    const resourceBaseUrl = args.resourceBaseUrl;
    const petResourceBaseUrl = getCompanionResourceBaseUrl(resourceBaseUrl);

    const petRuntimePet: CompanionRuntime['pet'] = {
      id: petDef.id,
      name: petDef.name,
      bodySize: petDef.bodySize,
      animations: petDef.animations,
      physics: petDef.physics,
    } as any;

    app = new CompanionApp({
      pet: petRuntimePet,
      canvas: canvasEl,
      resourceBaseUrl: petResourceBaseUrl,
      settings: {
        animationSpeed: s.animationSpeed,
        enableKeyboardReactions: s.enableKeyboardReactions,
        enableMouseReactions: s.enableMouseReactions,
        muted: s.muted,
      },
    });

    await app.init();
    app.setConversationState(conversationState);

    // Create companion runtime host and start its tick loop.
    // NOTE: CompanionApp currently stores its fsm privately; as a workaround we attach the
    // companion runtime host from outside is done through the CompanionApp idle/input methods.
    // For now, we hook into the existing input callbacks by using RendererActivityProvider
    // signals and wiring into CompanionAnimationFsmController through a small adapter.
    //
    // This MVP uses a local activity provider and forwards activity to FSM.
    const activityProvider = new RendererActivityProviderImpl();
    // Expose activity signals from input events.
    runtimeHost = new CompanionRuntimeHost((app as any).fsmController ?? (app as any).fsm ?? (app as any).animationFsmController, {} as any);
    runtimeLoop = createCompanionRuntimeHostLoop({
      host: runtimeHost,
      activityProvider,
      fsm: (app as any).fsmController ?? (app as any).fsm ?? (app as any).animationFsmController,
    });
    void runtimeLoop?.start();
  };


  return {
    attachCanvas: (canvas, wrap) => {
      canvasEl = canvas;
      wrapEl = wrap;

      // start input hooks
      detachHooks();
      keyboard = new KeyboardHook(onKeyboard);
      mouse = new MouseHook(onMouse);
      keyboard.start();
      mouse.start();

      // start runtime
      void loadPetAndStart();
    },
    detachCanvas: () => {
      canvasEl = null;
      wrapEl = null;

      detachHooks();
      stopRuntime();

      if (app) {
        app.stop();
        app = null;
      }
    },
    applySettings: (s) => {
      currentSettings = s;
      // CompanionApp currently doesn’t expose a direct applySettings API.
      // For MVP correctness: restart runtime when settings are applied after init.
      if (app && canvasEl) {
        void (async () => {
          app?.stop();
          stopRuntime();
          app = null;
          await loadPetAndStart();
        })();
      }
    },
    setConversationState: (state) => {
      conversationState = state;
      app?.setConversationState(state);
    },
    setConversationPanelOpen: (open) => {
      conversationPanelOpen = open;
    },
  };
}

export { createCompanionController as createPetController };
export type { CompanionController as PetController };

