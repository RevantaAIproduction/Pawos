"use client";

import { useEffect, useRef, useState } from "react";

interface LogEntry {
  t: string;
  event: string;
  detail?: string;
}

/**
 * Temporary diagnostic page — not part of the real OAuth flow. Tests whether
 * this browser will hand off navigation to the pawos:// scheme at all, using
 * the exact same window.location.href mechanism the real relay page uses
 * (see desktopRelay.ts's buildRelayResponse), but with zero OAuth involved.
 * If PawOS opens, the pawos:// handoff itself works and the real bug is
 * somewhere in the OAuth callback flow. If nothing happens, it's the
 * protocol registration or this browser's handling of the scheme — not OAuth.
 */
export function ProtocolDebugClient() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [attempted, setAttempted] = useState(false);
  const attemptedAtRef = useRef<number | null>(null);

  const append = (event: string, detail?: string) => {
    const t = new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
    setLog((prev) => [...prev, { t, event, detail }]);
  };

  useEffect(() => {
    const onBeforeUnload = () => append("beforeunload");
    const onPageHide = (e: PageTransitionEvent) => append("pagehide", `persisted=${e.persisted}`);
    const onVisibilityChange = () => append("visibilitychange", `state=${document.visibilityState}`);
    const onBlur = () => append("blur");
    const onFocus = () => append("focus");

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleClick = () => {
    append("click", "navigating to pawos://test");
    setAttempted(true);
    attemptedAtRef.current = Date.now();
    window.location.href = "pawos://test";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Protocol Debug</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Temporary diagnostic page. Tests only whether this browser hands off <code>pawos://</code>{" "}
          navigation to Windows — no OAuth, no tokens, no real endpoints involved.
        </p>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="self-start rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        Open PawOS
      </button>

      <div className="rounded-lg border border-neutral-300 p-4 text-sm">
        <p>
          <strong>Attempted navigation:</strong> {attempted ? "yes" : "no"}
        </p>
        <p className="mt-1 text-neutral-500">
          If PawOS opens (or a &quot;How do you want to open this?&quot; dialog appears), the protocol
          handoff works. If nothing happens after clicking, the browser is silently refusing the{" "}
          <code>pawos://</code> scheme — unrelated to OAuth.
        </p>
      </div>

      <div>
        <h2 className="font-semibold">Event log</h2>
        <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-neutral-400">No events yet.</p>
          ) : (
            log.map((entry, i) => (
              <div key={i}>
                <span className="text-neutral-400">{entry.t}</span> — <strong>{entry.event}</strong>
                {entry.detail ? ` (${entry.detail})` : ""}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
