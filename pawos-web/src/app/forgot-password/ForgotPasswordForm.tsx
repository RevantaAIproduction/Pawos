"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { AuthHeading, CodeInput, EmailChip, Spinner, inputClass, labelClass, primaryButtonClass, rememberAuthMethod } from "../login/AuthPieces";

type Step = "email" | "code" | "password";

/**
 * Forgot password, in three steps — the same as PawOS Desktop, and it works while signed out:
 *  1. email → Send code (a 6-digit code is emailed if there's an account);
 *  2. the code → Verify;
 *  3. a new password → Save (and you're logged in).
 */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendCode = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim());
      setLoading(false);
      if (error) {
        setMessage(error.message);
        return false;
      }
      setNotice(`If there's a PawOS account for ${email.trim()}, we sent it a 6-digit code.`);
      return true;
    } catch (err) {
      setLoading(false);
      setMessage(err instanceof Error ? err.message : "We couldn't send your code. Please try again.");
      return false;
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sendCode()) {
      setCode("");
      setStep("code");
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { data, error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code, type: "recovery" });
    setLoading(false);
    if (error || !data.session) {
      setMessage(error?.message === "Token has expired or is invalid" ? "That code isn't right or has expired. Check the email or send a new one." : (error?.message ?? "That code didn't work."));
      return;
    }
    setNotice(null);
    setStep("password");
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("The passwords don't match.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }
    rememberAuthMethod("email");
    window.location.href = "/dashboard";
  };

  const restart = () => {
    setMessage(null);
    setNotice(null);
    setStep("email");
  };

  const [title, subtitle] =
    step === "code" ? ["Check your email", "Enter the 6-digit code"] : step === "password" ? ["Choose a new password", "Your email is verified"] : ["Reset your password", "We'll email you a code"];

  return (
    <div className="w-full" data-testid="forgot-password-form" data-step={step}>
      <AuthHeading title={title} subtitle={subtitle} />

      {step === "email" && (
        <form onSubmit={submitEmail} className="mt-8 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Your email address" />
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? <Spinner /> : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="mt-8 flex flex-col gap-4">
          <EmailChip email={email.trim()} onChange={restart} />
          {notice && <p className="text-sm text-neutral-400">{notice}</p>}
          <div>
            <label htmlFor="code" className={labelClass}>
              Verification code
            </label>
            <CodeInput value={code} onChange={setCode} />
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={loading || code.length !== 6} className={primaryButtonClass}>
            {loading ? <Spinner /> : "Verify"}
          </button>
          <button type="button" onClick={() => void sendCode()} disabled={loading} className="text-sm text-neutral-400 hover:text-white hover:underline disabled:opacity-50">
            Send a new code
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={savePassword} className="mt-8 flex flex-col gap-4">
          <EmailChip email={email.trim()} onChange={restart} />
          <div>
            <label htmlFor="password" className={labelClass}>
              New password
            </label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
          </div>
          <div>
            <label htmlFor="confirm" className={labelClass}>
              Confirm new password
            </label>
            <input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} placeholder="Type it again" />
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={loading || password.length < 8} className={primaryButtonClass}>
            {loading ? <Spinner /> : "Save and log in"}
          </button>
        </form>
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
