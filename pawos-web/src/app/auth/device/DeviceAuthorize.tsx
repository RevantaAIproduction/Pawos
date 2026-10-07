"use client";

import { useState } from "react";
import { deviceAuthLoginPath, deviceCompletionUrl } from "../../../lib/auth/deviceAuthLinks";
import { createClient } from "../../../lib/supabase/client";
import { primaryButtonClass } from "../../login/AuthPieces";

/**
 * The confirm-then-return step of signing a PawOS client in. The completion address appears only
 * after the user clicks Authorize, on this page only; it is never put in this page's own address,
 * a cookie or storage. What it carries is a one-time handoff — not a session, a token or a key.
 */
export function DeviceAuthorize({ challenge, client, clientLabel, email }: { challenge: string; client: string; clientLabel: string; email: string | null }) {
  const [completionUrl, setCompletionUrl] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);

  const authorize = async () => {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, client }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; handoff?: string; expiresInSeconds?: number; message?: string };
      if (!response.ok || !data.ok || !data.handoff) {
        setMessage(data.message ?? "Something went wrong. Please try again.");
        return;
      }
      setCompletionUrl(deviceCompletionUrl(window.location.origin, data.handoff));
      setMinutes(Math.max(1, Math.round((data.expiresInSeconds ?? 300) / 60)));
    } catch {
      setMessage("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  /**
   * "Use a different account": signs this browser out of PawOS Web and sends it through the normal
   * login page, set to come back here — where the client can then be authorized as the account
   * that signed in. Only this browser's session ends; the same account stays signed in on the
   * user's other devices and PawOS clients. Nothing has been issued at this point, so nothing is
   * left pending for the account being left.
   */
  const useDifferentAccount = async () => {
    setSwitching(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setSwitching(false);
      setMessage("Couldn't sign out. Check your connection and try again.");
      return;
    }
    window.location.assign(deviceAuthLoginPath(challenge, client));
  };

  const copy = async () => {
    if (!completionUrl) return;
    try {
      await navigator.clipboard.writeText(completionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Couldn't copy. Select the URL and copy it yourself.");
    }
  };

  if (completionUrl) {
    return (
      <div className="w-full" data-testid="device-auth-complete-url">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Authentication successful</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">Return to {clientLabel}.</p>
        <p className="mt-8 text-xs font-medium uppercase tracking-wider text-neutral-500">Copy this URL</p>
        <p className="mt-2 select-all break-all rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 font-mono text-sm leading-relaxed text-white" data-testid="device-completion-url">
          {completionUrl}
        </p>
        <button type="button" onClick={copy} className={`${primaryButtonClass} mt-4`}>
          {copied ? "Copied" : "Copy URL"}
        </button>
        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          Paste it into {clientLabel}. It works once and expires in {minutes} {minutes === 1 ? "minute" : "minutes"}. Don&apos;t share it with anyone.
        </p>
        {message && <p className="mt-3 text-sm text-red-400" role="alert">{message}</p>}
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="device-auth-confirm">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in to {clientLabel}</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">
        {clientLabel} is asking to use your PawOS account{email ? <> (<span className="text-neutral-200">{email}</span>)</> : null}. It will be able to run PawOS tasks as you.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">Only continue if you just started signing in from {clientLabel} yourself.</p>
      <button type="button" onClick={authorize} disabled={pending || switching} className={`${primaryButtonClass} mt-8`}>
        {pending ? "Authorizing…" : "Authorize"}
      </button>
      <button
        type="button"
        onClick={useDifferentAccount}
        disabled={pending || switching}
        className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border border-neutral-800 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
        data-testid="device-auth-switch-account"
      >
        {switching ? "Signing out…" : "Use a different account"}
      </button>
      {message && <p className="mt-3 text-sm text-red-400" role="alert">{message}</p>}
    </div>
  );
}
