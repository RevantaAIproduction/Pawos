"use client";

import { useEffect, useState } from "react";

type OsId = "windows" | "macos" | "linux";

const REPO_RELEASES_URL = "https://github.com/RevantaAIproduction/Pawos/releases/latest";

const OS_OPTIONS: Record<
  OsId,
  { label: string; variants: { name: string; status: "available" | "soon"; note: string }[] }
> = {
  windows: {
    label: "Windows",
    variants: [
      { name: "Windows x64 (.exe)", status: "soon", note: "Not yet published — track progress on GitHub." },
      { name: "Windows ARM64", status: "soon", note: "Coming soon" },
    ],
  },
  macos: {
    label: "macOS",
    variants: [
      { name: "Apple Silicon (M-series)", status: "soon", note: "Coming soon" },
      { name: "Intel Macs", status: "soon", note: "Coming soon" },
    ],
  },
  linux: {
    label: "Linux",
    variants: [
      { name: "AppImage", status: "soon", note: "Not yet published — track progress on GitHub." },
      { name: "DEB package", status: "soon", note: "Coming soon" },
      { name: "RPM package", status: "soon", note: "Coming soon" },
    ],
  },
};

function detectOs(): OsId {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  return "windows";
}

export function OsDownloadPicker() {
  const [selected, setSelected] = useState<OsId | null>(null);

  useEffect(() => {
    setSelected(detectOs());
  }, []);

  const active = selected ?? "windows";

  return (
    <div>
      <div className="mx-auto flex w-fit gap-1 rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
        {(Object.keys(OS_OPTIONS) as OsId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelected(id)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              active === id ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-neutral-200"
            }`}
            aria-pressed={active === id}
          >
            {OS_OPTIONS[id].label}
            {selected === null && detectOs() === id ? " (detected)" : ""}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
        <h2 className="text-lg font-semibold">{OS_OPTIONS[active].label}</h2>
        <div className="mt-6 space-y-4">
          {OS_OPTIONS[active].variants.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
              <div>
                <p className="text-sm font-medium text-neutral-100">{v.name}</p>
                <p className="text-xs text-neutral-500">{v.note}</p>
              </div>
              <a
                href={REPO_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
              >
                {v.status === "available" ? "Download" : "View on GitHub"}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
