"use client";

import { useState } from "react";
import { primaryButtonClass } from "../../login/AuthPieces";

/**
 * The confirm-then-code step of signing a PawOS client in. The code appears only after the user
 * confirms, on this page only; it is never put in the address bar, a cookie or storage.
 */
export function DeviceAuthorize({ challenge, client, clientLabel, email }: { challenge: string; client: string; clientLabel: string; email: string | null }) {
  const [code, setCode] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const authorize = async () => {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/device/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, client }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; expiresInSeconds?: number; message?: string };
      if (!response.ok || !data.ok || !data.code) {
        setMessage(data.message ?? "Something went wrong. Please try again.");
        return;
      }
      setCode(data.code);
      setMinutes(Math.max(1, Math.round((data.expiresInSeconds ?? 300) / 60)));
    } catch {
      setMessage("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Couldn't copy. Select the code and copy it yourself.");
    }
  };

  if (code) {
    return (
      <div className="w-full" data-testid="device-auth-code">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Authentication successful</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">Return to {clientLabel} and paste this code.</p>
        <p className="mt-8 text-xs font-medium uppercase tracking-wider text-neutral-500">Your authentication code</p>
        <p className="mt-2 select-all rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-4 text-center font-mono text-2xl font-semibold tracking-widest text-white" data-testid="device-code">
          {code}
        </p>
        <button type="button" onClick={copy} className={`${primaryButtonClass} mt-4`}>
          {copied ? "Copied" : "Copy Code"}
        </button>
        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          The code works once and expires in {minutes} {minutes === 1 ? "minute" : "minutes"}. Don&apos;t share it with anyone.
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
      <button type="button" onClick={authorize} disabled={pending} className={`${primaryButtonClass} mt-8`}>
        {pending ? "Authorizing…" : "Authorize"}
      </button>
      {message && <p className="mt-3 text-sm text-red-400" role="alert">{message}</p>}
    </div>
  );
}
