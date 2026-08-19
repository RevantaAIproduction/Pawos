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
  // The reset email's link carries a one-time PKCE `code`, not an already-active session —
  // nothing establishes one automatically just by loading this page. Exchanging it here (rather
  // than depending on a redirect through /auth/callback, which requires that exact URL to be
  // pre-approved in Supabase's own Auth settings) keeps this page self-contained: it works
  // against whatever URL Supabase actually sent, no dashboard config to get right.
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setSessionError("This reset link is missing its code — request a new one from the Forgot Password page.");
      return;
    }
    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setSessionError(
          error.message.toLowerCase().includes("expired") || error.message.toLowerCase().includes("invalid")
            ? "This reset link has expired or was already used — request a new one from the Forgot Password page."
            : error.message
        );
        return;
      }
      setSessionReady(true);
    });
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
