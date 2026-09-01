"use client";

import { useState } from "react";
import { trackEvent } from "../../components/analytics/Analytics";
import { NotifyButton } from "./NotifyButton";
import { getDownloadPlatforms, type DownloadPlatformId } from "../../lib/config/downloadConfig";

const PLATFORMS = getDownloadPlatforms();

function detectOs(): DownloadPlatformId {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  return "windows";
}

export function OsDownloadPicker() {
  const [selected, setSelected] = useState<DownloadPlatformId>(() => detectOs());

  const active = selected;
  const activePlatform = PLATFORMS.find((p) => p.id === active)!;

  return (
    <div>
      <div className="mx-auto flex w-fit gap-1 rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              active === p.id ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-neutral-200"
            }`}
            aria-pressed={active === p.id}
          >
            {p.label}
            {selected === null && detectOs() === p.id ? " (detected)" : ""}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
        <h2 className="text-lg font-semibold">{activePlatform.label}</h2>
        <div className="mt-6 space-y-4">
          {activePlatform.variants.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
              <div>
                <p className="text-sm font-medium text-neutral-100">{v.label}</p>
                <p className="text-xs text-neutral-500">Coming soon</p>
              </div>
              <NotifyButton
                platform={activePlatform.id}
                onNotifyClick={() => trackEvent("download_notify_click", { platform: activePlatform.label, variant: v.label })}
                className="rounded-full border border-blue-400/40 px-4 py-1.5 text-xs font-semibold text-blue-200 transition hover:border-blue-300 hover:text-blue-100"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
