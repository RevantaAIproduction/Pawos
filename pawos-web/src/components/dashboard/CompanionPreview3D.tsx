"use client";

import dynamic from "next/dynamic";

// The existing 3D Paw preview (three.js is fetched only when this mounts in the browser).
const MiniCompanionCanvas = dynamic(() => import("../companion-preview/MiniCompanionCanvas").then((m) => m.MiniCompanionCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-900" />,
});

/** Live preview for a catalog Companion whose `preview` is "paw3d". Fills its parent box. */
export function CompanionPreview3D({ label }: { label: string }) {
  return (
    <div role="img" aria-label={`${label} preview`} className="h-full w-full">
      <MiniCompanionCanvas />
    </div>
  );
}
