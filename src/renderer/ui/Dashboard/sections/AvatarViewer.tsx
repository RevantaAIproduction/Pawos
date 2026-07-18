import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import { CompanionAnimationController } from '../../../avatar/CompanionAnimationController';
import { BodyLookYaw, cursorAngleFromCenter } from '../../../avatar/BodyLookYaw';
import { ANIMATION_NAMES, type AnimationName } from '../../../avatar/AnimationLibrary';

type LoadStatus = 'loading' | 'ready' | 'error';

export function AvatarViewer() {
  const ipc = useIpcBridge();
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CompanionAnimationController | null>(null);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [failures, setFailures] = useState<[AnimationName, string][]>([]);
  const [current, setCurrent] = useState<AnimationName | null>(null);
  const [queue, setQueue] = useState<AnimationName[]>([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08080a);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);
    scene.add(new THREE.GridHelper(4, 8, 0x333338, 0x222226));

    const controller = new CompanionAnimationController(
      () => ipc.getAnimationsBaseUrl(),
      () => ipc.getCharactersBaseUrl()
    );
    controllerRef.current = controller;

    const unsubscribe = controller.on((event) => {
      setCurrent(controller.getCurrent());
      setQueue(controller.getQueue());
      void event;
    });

    let disposed = false;
    controller.whenReady().then(() => {
      if (disposed) return;
      if (controller.root) {
        controller.root.scale.setScalar(1);
        scene.add(controller.root);
      }
      if (controller.faceOverlayMesh) scene.add(controller.faceOverlayMesh);
      const failureEntries: [AnimationName, string][] = [];
      controller.getLoadFailures().forEach((err, name) => failureEntries.push([name, err.message]));
      setFailures(failureEntries);
      setStatus(failureEntries.length === ANIMATION_NAMES.length ? 'error' : 'ready');
      setCurrent(controller.getCurrent());
    });

    const bodyLookYaw = new BodyLookYaw();

    const clock = new THREE.Clock();
    let frameId: number;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      controller.update(delta, camera);
      bodyLookYaw.update(delta, controller.root);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

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
      window.removeEventListener('resize', handleResize);
      mount.removeEventListener('mousemove', handleMouseMove);
      mount.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(frameId);
      unsubscribe();
      controller.dispose();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [ipc]);

  return (
    <div>
      <p className={styles.cardBody} style={{ marginBottom: 12 }}>
        Loads the real FBX animation library (assets/animations) onto the shared Mixamo skeleton —
        static geometry only, no AI/speech/lip sync wired here yet.
      </p>

      <div style={{ display: 'flex', gap: 16 }}>
        <div
          ref={mountRef}
          style={{ width: 420, height: 420, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <p className={styles.cardBody}>
            Status: {status} · Current: {current ?? '—'} · Queue: {queue.join(', ') || '—'}
          </p>

          {failures.length > 0 && (
            <div className={styles.card} style={{ marginBottom: 12, borderColor: '#e05d5d' }}>
              <h3 className={styles.cardTitle}>{failures.length} animation(s) failed to load</h3>
              {failures.map(([name, message]) => (
                <p key={name} className={styles.cardBody}>
                  {name}: {message}
                </p>
              ))}
            </div>
          )}

          <div className={styles.quickActions}>
            {ANIMATION_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.chip}
                onClick={() => controllerRef.current?.play(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className={styles.quickActions} style={{ marginTop: 10 }}>
            <button type="button" className={styles.chip} onClick={() => controllerRef.current?.queue('thankful')}>
              queue(&quot;thankful&quot;)
            </button>
            <button type="button" className={styles.chip} onClick={() => controllerRef.current?.crossFade('neutral')}>
              crossFade(&quot;neutral&quot;)
            </button>
            <button type="button" className={styles.chip} onClick={() => controllerRef.current?.stop()}>
              stop()
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
