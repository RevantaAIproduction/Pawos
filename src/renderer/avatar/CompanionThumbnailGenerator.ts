import * as THREE from 'three';
import { loadUploadedCompanionFile } from './CompanionUploadPipeline';

/**
 * Renders a real, single-frame snapshot of an uploaded companion file into a
 * PNG data URL — used as the companion's thumbnail in My Companions/Gallery
 * cards. Uses its own throwaway scene/camera/renderer (never touches the
 * running companion overlay), so generating a thumbnail never disturbs
 * whatever else is currently rendering. The camera
 * auto-frames the model's real bounding box — no assumed scale or pose.
 */
export async function generateCompanionThumbnail(filePath: string, size = 256): Promise<string> {
  const root = await loadUploadedCompanionFile(filePath);

  const scene = new THREE.Scene();
  scene.add(root);
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(1, 2, 2);
  scene.add(keyLight);

  const box = new THREE.Box3().setFromObject(root);
  const boxSize = new THREE.Vector3();
  box.getSize(boxSize);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z) || 1;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, maxDim * 20);
  const distance = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.6;
  camera.position.set(center.x, center.y + boxSize.y * 0.15, center.z + distance);
  camera.lookAt(center);

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(size, size, false);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    renderer.dispose();
  }
}
