import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import { CompanionAnimationController } from '../../../avatar/CompanionAnimationController';
import { BodyLookYaw, cursorAngleFromCenter } from '../../../avatar/BodyLookYaw';

/**
 * Idle preview of the real companion character for the dashboard (a
 * separate window/process from the actual companion overlay, so this
 * shows a representative idle animation rather than mirroring the
 * overlay's live emotion in real time — that needs cross-window state
 * syncing, which is out of scope here).
 */
export function AvatarPreview({ active }: { active: boolean }) {
  const ipc = useIpcBridge();
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

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

    const controller = new CompanionAnimationController(
      () => ipc.getAnimationsBaseUrl(),
      () => ipc.getCharactersBaseUrl()
    );
    let disposed = false;
    controller.whenReady().then(() => {
      if (disposed || !controller.root) return;
      scene.add(controller.root);
      if (controller.faceOverlayMesh) scene.add(controller.faceOverlayMesh);
      controller.play('happyIdle');
      controller.setExpression('happy');
    });

    const bodyLookYaw = new BodyLookYaw();

    const clock = new THREE.Clock();
    let frameId: number;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      controller.update(delta, camera);
      bodyLookYaw.update(delta, controller.root);
      renderer.render(scene, camera);
    };
    tick();

    // Subtle head tilt (setLookAt) plus a full body turn toward the cursor —
    // its angle around the preview's center maps directly to facing
    // direction, so a full circle sweeps a full 360°, not just a head wobble.
    const handleMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      controller.setLookAt({ x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) });
      bodyLookYaw.setTarget(cursorAngleFromCenter(e.clientX, e.clientY, rect));
    };
    const handleMouseLeave = () => bodyLookYaw.setTarget(null);
    mount.addEventListener('mousemove', handleMouseMove);
    mount.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      disposed = true;
      mount.removeEventListener('mousemove', handleMouseMove);
      mount.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(frameId);
      controller.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [ipc, active]);

  return <div ref={mountRef} style={{ width: 220, height: 220 }} />;
}
