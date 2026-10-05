"use client";

import { useEffect } from "react";
import { createClient } from "../supabase/client";

/** How often an open page re-checks that its session wasn't ended in PawOS Desktop. */
export const SESSION_CHECK_INTERVAL_MS = 2 * 60 * 1000;

/** True only when the server says the session is gone — never for a network failure. */
export function isSignedOutError(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403;
}

/**
 * One account across PawOS Web and PawOS Desktop: signing out in the app (or switching account
 * there, which signs the old one out) ends this browser's session too. Every page load already checks
 * the session on the server (proxy.ts); this notices it on a page that stays open — on focus and
 * every couple of minutes — and goes to the login page.
 */
export function useSignedOutElsewhere(): void {
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      const { error } = await createClient().auth.getUser();
      if (!cancelled && isSignedOutError(error)) window.location.href = "/login";
    };
    const onVisible = () => void check();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, SESSION_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);
}
