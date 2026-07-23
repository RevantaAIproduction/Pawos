"use client";

import { useEffect, useRef } from "react";

const ASSET_BASE_URL = "/assets/companion/";

/**
 * The 3D runtime (three.js + the companion controller) is dynamically
 * imported here, not at module scope — nothing 3D-related is fetched until
 * this component actually mounts, i.e. only after the visitor opens the
 * ambient widget. Unmounting (closing the widget) disposes the renderer so
 * no GPU/CPU cost lingers while collapsed.
 */
export function MiniCompanionCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const [THREE, { CompanionPreviewController }] = await Promise.all([
        import("three"),
        import("../../lib/companion-preview/CompanionPreviewController"),
      ]);
      if (disposed) return;

      const mount = mountRef.current;
      if (!mount) return;

      const width = mount.clientWidth;
      const height = mount.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
      camera.position.set(0, 1.35, 2.8);
      camera.lookAt(0, 1.1, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
      dirLight.position.set(1.5, 3, 2);
      scene.add(dirLight);

      const controller = new CompanionPreviewController(ASSET_BASE_URL);
      let rafId = 0;
      let lastTime = performance.now();

      controller.whenReady().then(() => {
        if (disposed || !controller.root) return;
        scene.add(controller.root);
        controller.play("salute");
      });

      function animate() {
        rafId = requestAnimationFrame(animate);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        controller.update(delta);
        renderer.render(scene, camera);
      }
      animate();

      cleanup = () => {
        cancelAnimationFrame(rafId);
        controller.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" />;
}
