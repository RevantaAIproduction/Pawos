# IMPORT_TREE.md

This file enumerates import trees (imports → imports of imports …) for the following modules:
- `src/renderer/renderer/PawOSPetApp.ts`
- `src/renderer/renderer/PetAnimationFsmController.ts`
- `src/renderer/renderer/PetPhysicsController.ts`
- `src/renderer/renderer/PetCanvasRenderer.ts`

## Leaf-node import tree notes
- Because this environment lacks repo-wide ripgrep, the trees below are constructed from direct inspection of the listed files only.
- For each imported module, only its direct import specifiers are shown here (leaf nodes stop where we don’t recursively inspect additional files).

---

## 1) PawOSPetApp.ts
`PawOSPetApp.ts`
↓ imports
- `./RenderClock`
- `./PetRendererTypes` (type)
- `./PetAnimationFsmContext` (type)
- `./PetAnimationFsmController`
- `./PetPhysicsController`
- `./PetCanvasRenderer`
- `./idle/createIdleDetector`
- `../animations/AnimationPlayer`

↓ imports of imports (not expanded further; only direct specifiers were extracted from source above)

---

## 2) PetAnimationFsmController.ts
`PetAnimationFsmController.ts`
↓ imports
- `./PetAnimationFsmContext` (type)
- `./PetPhysicsController` (type)
- `./PetAnimationFsm`
- `./PetAnimationFsm` (type `PetAnimState`)

↓ imports of imports (not expanded further)

---

## 3) PetPhysicsController.ts
`PetPhysicsController.ts`
↓ imports
- `../pets/petLoader/types` (type `PetDefinition`)
- `./PetRendererTypes` (type `PetRuntime`)

↓ imports of imports (not expanded further)

---

## 4) PetCanvasRenderer.ts
`PetCanvasRenderer.ts`
↓ imports
- `../animations/AnimationPlayer` (type `AnimationPlayer`)

↓ imports of imports (not expanded further)

