"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const STORAGE_KEY = "pawos-cookie-consent";
export type ConsentChoice = "accepted" | "declined";

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "declined" ? v as ConsentChoice : null;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v !== "accepted" && v !== "declined") {
      setVisible(true);
    }
  }, []);

  function choose(next: ConsentChoice) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setVisible(false);
    window.dispatchEvent(new Event("pawos-consent-changed"));
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl sm:inset-x-auto sm:right-6 pointer-events-auto"
    >
      <p className="text-sm text-neutral-300">
        We use strictly necessary cookies to run this site, and optional analytics cookies if you consent. See our{" "}
        <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>.
      </p>
      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => choose("declined")}
          className="rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 transition"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-4 py-2 text-xs font-semibold text-black hover:opacity-90 transition"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
