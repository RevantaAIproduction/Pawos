# PROJECT_ARCHITECTURE.md

## High-level overview
PawOS is an Electron + React + Canvas desktop pets application.

- **Main process**: creates the transparent/click-through desktop window, tray integration, and IPC.
- **Preload**: exposes a safe bridge API to renderer.
- **Renderer process**: React UI (settings panel + canvas) and the runtime pet engine.

## Main process
Key responsibilities:
- app lifecycle
- tray management
- window creation (overlay desktop pet)
- IPC handlers for:
  - settings get/set
  - pet list/loading
  - UI open settings

(See `src/main/*`.)

## Renderer process
Key responsibilities:
- `App.tsx` hosts:
  - `PetCanvas` (attaches runtime to canvas)
  - `SettingsPanel` overlay
- Runtime engine:
  - `PawOSPetApp` orchestrates physics, FSM, animation playback, and rendering.

Main renderer modules:
- `src/renderer/ui/PetCanvas/PetCanvas.tsx`
- `src/renderer/pets/petController/*`
- `src/renderer/renderer/PawOSPetApp.ts`
- `src/renderer/renderer/PetPhysicsController.ts`
- `src/renderer/renderer/PetAnimationFsmController.ts`
- `src/renderer/animations/AnimationPlayer.ts`
- `src/renderer/pets/petLoader/PetLoader.ts`

## IPC flow
1. Renderer calls `useIpcBridge()` which wraps `ipcBridgeImplementation`.
2. IPC requests are handled in the main process (`src/main/ipc/ipc.ts`).
3. Settings are stored and propagated back to the renderer.

## Pet system
### Loading
- `PetLoader` calls IPC to obtain serialized pet config.
- `PetDefinitionResolver` converts serialized config into normalized `PetDefinition`.

### Runtime usage
- `PawOSPetApp` consumes a `PetDefinition` (`pet`) and loads animation assets via `AnimationPlayer`.

## FSM (finite state machine)
- `PetAnimationFsmController` owns a FSM and drives animation transitions.
- `PetAnimationFsm` maps states to animation names.

## Physics engine
- `PetPhysicsController` updates position/rotation and handles bounds collisions.

## Asset pipeline
- `AnimationPlayer` loads:
  - gif
  - png/webp sequences
  - sprite sheets

Assets are loaded relative to a runtime base URL passed into pet app creation.

## Settings system
- React `SettingsPanel` edits settings.
- `App.tsx` listens to IPC updates and calls controller `applySettings`.
- `usePetController` forwards settings to the active `PawOSPetApp`.

## Documentation
Additional docs (when completed):
- `PET_CREATION_GUIDE.md`
- `RELEASE_CHECKLIST.md`

