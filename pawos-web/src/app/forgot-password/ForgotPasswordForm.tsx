"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthHeading, EmailChip, Spinner, inputClass, labelClass, primaryButtonClass } from "../login/AuthPieces";

/**
 * Forgot password: enter the email → we email a "Reset password" link → the link opens
 * /reset-password, where you create the new password (and re-enter it).
 */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sendLink = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // PawOS sends the email (api/auth/password/forgot) — not Supabase.
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setLoading(false);
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "We couldn't send the email. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setLoading(false);
      setMessage("Couldn't reach PawOS. Check your connection and try again.");
    }
  };

  return (
    <div className="w-full" data-testid="forgot-password-form" data-step={sent ? "sent" : "email"}>
      {sent ? (
        <>
          <AuthHeading title="Check your email" subtitle="Open the link to reset your password" />
          <div className="mt-8 flex flex-col gap-4">
            <EmailChip
              email={email.trim()}
              onChange={() => {
                setSent(false);
                setMessage(null);
              }}
            />
            <p className="text-sm leading-relaxed text-neutral-400">
              If there&apos;s a PawOS account for this email, we sent it a <span className="text-neutral-200">Reset password</span> link.
              Open it to create a new password. The link works once.
            </p>
            {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
            <button type="button" onClick={() => void sendLink()} disabled={loading} className={primaryButtonClass}>
              {loading ? <Spinner /> : "Send the link again"}
            </button>
          </div>
        </>
      ) : (
        <>
          <AuthHeading title="Reset your password" subtitle="We'll email you a link" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendLink();
            }}
            className="mt-8 flex flex-col gap-4"
          >
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Your email address" />
            </div>
            {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
            <button type="submit" disabled={loading} className={primaryButtonClass}>
              {loading ? <Spinner /> : "Send reset link"}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-neutral-400">
        Remembered it?{" "}
        <Link href="/login" className="text-neutral-200 underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
