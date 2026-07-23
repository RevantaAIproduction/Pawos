"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NARRATION_LINES } from "../../lib/companion-preview/script";

type Phase = "gate" | "loading" | "greeting" | "narrating" | "done" | "error";

const ASSET_BASE_URL = "/assets/companion/";

export function CompanionPreview() {
  const [phase, setPhase] = useState<Phase>("gate");
  const [lineIndex, setLineIndex] = useState(0);
  const mountRef = useRef<HTMLDivElement>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => disposeRef.current?.();
  }, []);

  async function enable() {
    setPhase("loading");
    try {
      const [THREE, { CompanionPreviewController }] = await Promise.all([
        import("three"),
        import("../../lib/companion-preview/CompanionPreviewController"),
      ]);

      const mount = mountRef.current;
      if (!mount) return;

      const width = mount.clientWidth;
      const height = mount.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
      camera.position.set(0, 1.3, 3.2);
      camera.lookAt(0, 1, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
      dirLight.position.set(1.5, 3, 2);
      scene.add(dirLight);

      const controller = new CompanionPreviewController(ASSET_BASE_URL);
      let disposed = false;
      let rafId = 0;
      let lastTime = performance.now();

      const unsubscribe = controller.on((event) => {
        if (disposed) return;
        if (event.type === "end" && event.name === "salute") {
          startNarration(controller);
        }
      });

      function startNarration(c: InstanceType<typeof CompanionPreviewController>) {
        setPhase("narrating");
        c.play("talking");
        let i = 0;
        setLineIndex(0);
        const advance = () => {
          if (disposed) return;
          i += 1;
          if (i >= NARRATION_LINES.length) {
            c.play("neutral");
            setPhase("done");
            return;
          }
          setLineIndex(i);
          window.setTimeout(advance, NARRATION_LINES[i].durationMs);
        };
        window.setTimeout(advance, NARRATION_LINES[0].durationMs);
      }

      controller.whenReady().then(() => {
        if (disposed || !controller.root) return;
        scene.add(controller.root);
        setPhase("greeting");
        controller.play("salute");
      }).catch(() => {
        if (!disposed) setPhase("error");
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

      const handleResize = () => {
        if (!mount) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", handleResize);

      disposeRef.current = () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", handleResize);
        unsubscribe();
        controller.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    } catch {
      setPhase("error");
    }
  }

  function askQuestion() {
    window.dispatchEvent(new CustomEvent("pawos-open-site-companion"));
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 sm:grid-cols-[280px_1fr] sm:p-8">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
        {phase === "gate" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-neutral-400">See the real companion that lives on your desktop.</p>
            <button
              type="button"
              onClick={enable}
              className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90"
            >
              Enable Companion
            </button>
          </div>
        )}
        {phase === "loading" && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-500">Loading companion…</p>
          </div>
        )}
        {phase === "error" && (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-sm text-neutral-500">
              The companion preview couldn&apos;t load in this browser. It still works in the desktop app.
            </p>
          </div>
        )}
        <div ref={mountRef} className="h-full w-full" />
      </div>

      <div className="flex flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Meet Paw</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">This is the same companion that lives on your desktop.</h3>

        <div className="mt-4 min-h-[3.5rem]">
          {(phase === "narrating" || phase === "done") && (
            <p className="text-neutral-300">{NARRATION_LINES[lineIndex].text}</p>
          )}
          {phase === "gate" && (
            <p className="text-sm text-neutral-500">
              Click Enable Companion to see it move and introduce itself — real animation, not a video.
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">On this website</p>
            <p className="mt-1 text-sm text-neutral-400">A visual preview only — no AI runs behind it here.</p>
          </div>
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">On the desktop app</p>
            <p className="mt-1 text-sm text-neutral-300">
              Paw Go is free. Pro, Pro Max, Team, and Enterprise unlock real AI conversations and autonomous engineering.
            </p>
          </div>
        </div>

        {phase === "done" && (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={askQuestion}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              Ask a question
            </button>
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
            >
              Download PawOS
            </Link>
            <Link href="/pricing" className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800">
              Compare plans
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
