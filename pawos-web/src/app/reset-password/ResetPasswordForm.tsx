"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The reset email's link establishes a session one of two ways depending on Supabase's own
  // project config, and this page can't assume which: a PKCE `?code=` query param (exchanged via
  // exchangeCodeForSession) or the older `#access_token=...&type=recovery` hash fragment, which
  // @supabase/ssr's browser client auto-detects and consumes during its own init — but that can
  // resolve asynchronously via a PASSWORD_RECOVERY auth event rather than being available the
  // instant getSession() is first called, so this listens for that event too rather than trusting
  // a single synchronous check. The 4s timeout only ever fires for a genuinely broken/expired link
  // — a working one always resolves via one of the three paths well before that.
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Parameter NAMES only, never values — safe to show/screenshot, and tells us exactly which link
  // format Supabase actually sent (query vs. hash, which keys) without exposing the one-time
  // recovery token itself, whether or not it's still live.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");
    const searchKeys = Array.from(searchParams.keys());
    const hashKeys = typeof window !== "undefined" && window.location.hash.length > 1
      ? Array.from(new URLSearchParams(window.location.hash.slice(1)).keys())
      : [];
    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      setSessionReady(true);
    };
    const markInvalid = (reason: string) => {
      if (settled) return;
      settled = true;
      setDiagnostic(`query params: [${searchKeys.join(", ") || "none"}] · hash params: [${hashKeys.join(", ") || "none"}] · ${reason}`);
      setSessionError("This reset link is invalid or has expired — request a new one from the Forgot Password page.");
    };

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => (error ? markInvalid(`exchange failed: ${error.message}`) : markReady()));
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) markReady();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });
    const timeout = window.setTimeout(() => markInvalid("no code, no session, no recovery event within 4s"), 4000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords don't match.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (sessionError) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <h1 className="text-2xl font-bold">Link no longer valid</h1>
        <p className="mt-3 text-sm text-neutral-400">{sessionError}</p>
        {diagnostic && <p className="mt-3 break-words font-mono text-[11px] text-neutral-600">{diagnostic}</p>}
        <a
          href="/forgot-password"
          className="mt-6 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Request a new link
        </a>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <p className="text-sm text-neutral-400">Verifying your reset link…</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="mt-3 text-sm text-neutral-400">You can now log in with your new password.</p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Opened from your password reset email — enter a new password below.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-400">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-neutral-400">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
          />
        </div>

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading"}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
