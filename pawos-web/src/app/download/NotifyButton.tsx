"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

/**
 * Replaces the old plain `<a href="/signup?intent=pawos-desktop-waitlist">`
 * used everywhere "Notify me" appears. That always sent the visitor through
 * signup, even when they were already logged in — the reported bug. Now:
 * signed-in visitors join the waitlist in place (no navigation, no
 * re-login) and get an immediate confirmation email; signed-out visitors
 * still go through /signup exactly as before, since we need at least an
 * email address to notify them and anonymous capture wasn't part of what
 * broke.
 */
export function NotifyButton({
  platform,
  source = "download-page",
  className,
  children = "Notify me",
  onNotifyClick,
}: {
  platform?: string;
  source?: string;
  className: string;
  children?: React.ReactNode;
  /** Fired on every click, before the auth branch — for analytics parity with the old anchor's onClick. */
  onNotifyClick?: () => void;
}) {
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "joined" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setIsLoggedIn(Boolean(data.user));
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = async () => {
    onNotifyClick?.();

    if (!authChecked || !isLoggedIn) {
      const params = new URLSearchParams({ intent: "pawos-desktop-waitlist" });
      if (platform) params.set("platform", platform);
      window.location.href = `/signup?${params.toString()}`;
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, source }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("joined");
    } catch {
      setStatus("error");
    }
  };

  if (status === "joined") {
    return <span className={className}>You&apos;re on the list — check your email</span>;
  }

  return (
    <button type="button" onClick={handleClick} disabled={status === "loading"} className={className}>
      {status === "loading" ? "Adding you…" : status === "error" ? "Something went wrong — retry" : children}
    </button>
  );
}
