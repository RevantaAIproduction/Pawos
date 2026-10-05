"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { AuthHeading, Spinner, inputClass, labelClass, primaryButtonClass } from "../login/AuthPieces";

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
    // 'implicit' — matches the flow ForgotPasswordForm.tsx now requests with (see
    // createClient()'s own doc comment). Kept consistent so this page reads the same kind of
    // session the request side produced, rather than mixing flow types.
    const supabase = createClient("implicit");
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
      setMessage("The two passwords don't match.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      // 'implicit' — matches the flow ForgotPasswordForm.tsx now requests with (see the useEffect above and createClient()'s own doc comment).
      const supabase = createClient("implicit");
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
      <div className="w-full">
        <AuthHeading title="This link has expired" subtitle="Request a new one" />
        <p className="mt-6 text-sm leading-relaxed text-neutral-400">{sessionError}</p>
        {diagnostic && <p className="mt-3 break-words font-mono text-[11px] text-neutral-600">{diagnostic}</p>}
        <a href="/forgot-password" className={`${primaryButtonClass} mt-6`}>
          Send a new reset link
        </a>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex w-full items-center gap-3 text-sm text-neutral-400">
        <Spinner /> Checking your reset link…
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="w-full">
        <AuthHeading title="Password updated" subtitle="You're logged in" />
        <a href="/dashboard" className={`${primaryButtonClass} mt-8`}>
          Continue
        </a>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="reset-password-form">
      <AuthHeading title="Create a new password" subtitle="Use at least 8 characters" />

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="password" className={labelClass}>
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Create a new password"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Re-enter new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="Type it again"
          />
        </div>

        {message && <p className="text-sm text-red-400" role="alert">{message}</p>}

        <button type="submit" disabled={status === "loading" || password.length < 8} className={primaryButtonClass}>
          {status === "loading" ? <Spinner /> : "Continue"}
        </button>
      </form>
    </div>
  );
}
