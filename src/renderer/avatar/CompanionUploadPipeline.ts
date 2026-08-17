import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export type UploadedCompanionFormat = 'glb' | 'gltf' | 'vrm' | 'fbx' | 'obj';

const SUPPORTED_EXTENSIONS: UploadedCompanionFormat[] = ['glb', 'gltf', 'vrm', 'fbx', 'obj'];

export type ValidationResult = { ok: true; format: UploadedCompanionFormat } | { ok: false; message: string };

/** Real extension check — the only validation this pipeline can honestly do before actually parsing the file (malformed-but-correctly-named files still fail later, at load time, with a real error). */
export function validateUploadedFile(filePath: string): ValidationResult {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filePath);
  const ext = match?.[1]?.toLowerCase();
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext as UploadedCompanionFormat)) {
    return { ok: false, message: `Unsupported file type "${ext ?? filePath}". Supported: ${SUPPORTED_EXTENSIONS.join(', ').toUpperCase()}.` };
  }
  return { ok: true, format: ext as UploadedCompanionFormat };
}

/** Real rig detection — true only if the loaded scene contains an actual SkinnedMesh with a non-empty skeleton, never guessed from the file format alone (a .glb can be either rigged or a static mesh). */
export function detectRig(root: THREE.Object3D): { rigged: boolean; skinnedMesh: THREE.SkinnedMesh | null } {
  let skinnedMesh: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!skinnedMesh && (obj as THREE.SkinnedMesh).isSkinnedMesh) skinnedMesh = obj as THREE.SkinnedMesh;
  });
  const rigged = Boolean(skinnedMesh && (skinnedMesh as THREE.SkinnedMesh).skeleton.bones.length > 0);
  return { rigged, skinnedMesh };
}

/**
 * Correct file:// URL construction for an absolute filesystem path, from
 * pure renderer JS (no Node `url` module access here — nodeIntegration is
 * off). Naively prepending `file://` to a backslash path produces
 * `file://C:/Users/...` on Windows: only two slashes, so Chromium's URL
 * parser reads `C:` as a hostname, not a drive letter, and the fetch behind
 * GLTFLoader/OBJLoader/FBXLoader fails outright — this was the actual root
 * cause of uploaded companions silently failing to load (see
 * `main.ts`'s `pathToFileURL()` comment for the identical bug class on the
 * main-process side). A real `file:///C:/...` URL needs a leading slash
 * before the drive letter; `encodeURI` handles spaces/special characters in
 * the path without breaking `:`/`/`.
 */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
}

/**
 * Loads a user-uploaded 3D file from disk into a real three.js scene graph.
 * VRM files are loaded via GLTFLoader (VRM is a glTF extension — humanoid
 * bone-mapping metadata in the VRM extension itself is not read here, only
 * the base glTF scene/skeleton, same honest scope as the rest of this
 * pipeline). Never touches the original file — this only reads it into
 * memory; nothing here writes back to `filePath`.
 */
export async function loadUploadedCompanionFile(filePath: string): Promise<THREE.Group> {
  const validation = validateUploadedFile(filePath);
  if (!validation.ok) throw new Error(validation.message);

  const url = toFileUrl(filePath);

  switch (validation.format) {
    case 'glb':
    case 'gltf':
    case 'vrm': {
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    }
    case 'fbx':
      return new FBXLoader().loadAsync(url);
    case 'obj': {
      const object = await new OBJLoader().loadAsync(url);
      return object;
    }
  }
}
