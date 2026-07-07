# PET_CREATION_GUIDE.md

## Goal
Create new pet content so the app can load it dynamically.

## Pet folder structure
Expected (by design intent):
- `assets/pets/{petId}/`
  - animation asset files per animation descriptor

Note: The repo currently contains loader/engine code but the concrete `assets/pets/*` dataset is not included in this code-only view.

## config schema (concept)
The renderer expects a normalized `PetDefinition` with:

- `id: string`
- `name: string`
- `bodySize: { width: number; height: number }`
- `animations: PetAnimationsConfig`
  - `idle, walking, running, sleeping, typing, eating, jumping, spinning, catchBall, happy, celebrate`
- `physics: { mass, restitution, speed, ballChase }`

In serialized form (as returned by IPC), animations are described by asset descriptors.

### Supported animation formats
`AnimationPlayer` supports asset kinds:
- `gif`
- `pngSequence`
- `webpSequence`
- `spriteSheet`

## Asset naming conventions
- **pngSequence/webpSequence**:
  - `src` is a base path without the frame number extension.
  - `AnimationPlayer` constructs frame filenames by padding the frame index to 4 digits.
  - Frame filename format (as implemented):
    - `${baseWithoutExt}_${frameIndexPadded}.${png|webp}`

- **spriteSheet**:
  - `src` points to a single sheet image.
  - `frameWidth/frameHeight` are required.
  - The renderer computes frames via grid slicing.

## Adding new pets without code changes
To support new pets without code changes:
- Add the pet’s serialized config and assets such that the main process IPC:
  - includes it in `petsList()`
  - returns it from `petsLoad(petId)`
- Ensure the renderer receives:
  - a valid `SerializedPet` compatible with `PetDefinitionResolver`.

## Troubleshooting invalid pets
Common issues:
- **Missing animations**: `AnimationPlayer` will attempt to load assets for every animation key.
- **Incorrect paths**:
  - Ensure `resourceBaseUrl` is correct for where assets are packaged.
- **Sprite sheet dimensions wrong**:
  - Ensure `frameWidth` and `frameHeight` match the sheet grid.
- **Corrupt descriptor**:
  - Validate that frameCount exists for sequences.

## Validation checklist (recommended)
- Add a pet asset set for a known petId.
- Verify each animation successfully loads.
- Verify physics:
  - body size is reasonable for bounding box.


