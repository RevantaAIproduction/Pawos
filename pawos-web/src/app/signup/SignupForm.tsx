"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import {
  AuthHeading,
  CodeInput,
  EmailChip,
  ProviderRow,
  Spinner,
  inputClass,
  labelClass,
  primaryButtonClass,
  rememberAuthMethod,
  safeNextPath,
  startOAuth,
} from "../login/AuthPieces";

type Step = "details" | "code" | "password";

/**
 * Sign up: Google or GitHub in one click, or by email in three steps —
 *  1. first and last name and email → Continue (a 6-digit code is emailed);
 *  2. the code → Verify;
 *  3. a password and the Terms/Privacy acceptance → Create account (and you're logged in).
 * The same steps as PawOS Desktop. PawOS emails the code (/api/auth/signup/code); the browser checks
 * it (verifyOtp), so the email is proven before a password is ever set (updateUser).
 */
export function SignupForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const isDesktopWaitlist = params.get("intent") === "pawos-desktop-waitlist";

  const [step, setStep] = useState<Step>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<"signup" | "email">("signup");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | null>(null);

  const sendCode = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // PawOS emails the code (api/auth/signup/code) — not Supabase.
      const response = await fetch("/api/auth/signup/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; verifyType?: "signup" | "email" };
      setLoading(false);
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "We couldn't send your code. Please try again.");
        return false;
      }
      setVerifyType(data.verifyType === "email" ? "email" : "signup");
      setNotice(`We sent a 6-digit code to ${email.trim()}.`);
      return true;
    } catch {
      setLoading(false);
      setMessage("Couldn't reach PawOS. Check your connection and try again.");
      return false;
    }
  };

  const submitDetails = async (e: React.FormEvent) => {
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
    const { data, error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code, type: verifyType });
    setLoading(false);
    if (error || !data.session) {
      setMessage(error?.message === "Token has expired or is invalid" ? "That code isn't right or has expired. Check the email or send a new one." : (error?.message ?? "That code didn't work."));
      return;
    }
    setNotice(null);
    setStep("password");
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms || !agreedToPrivacy) {
      setMessage("Please accept the Terms of Service and the Privacy Policy.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setLoading(false);
        setMessage(error.message);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Record the Terms/Privacy acceptance (it can be accepted later if this fails).
        await fetch("/api/auth/accept-legal", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ documentSlugs: ["terms", "privacy-policy"] }),
        }).catch(() => {});
      }
      rememberAuthMethod("email");
      window.location.href = next;
    } catch (err) {
      setLoading(false);
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const oauth = async (provider: "google" | "github") => {
    setOauthPending(provider);
    setMessage(null);
    const error = await startOAuth(provider, next);
    if (error) {
      setOauthPending(null);
      setMessage(error);
    }
  };

  const backToDetails = () => {
    setMessage(null);
    setNotice(null);
    setPassword("");
    setStep("details");
  };

  const loginHref = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  const [title, subtitle] =
    step === "code"
      ? ["Check your email", "Enter the 6-digit code"]
      : step === "password"
        ? ["Choose a password", "Your email is verified"]
        : isDesktopWaitlist
          ? ["Join the PawOS Desktop launch list", "Get launch updates"]
          : ["Welcome to PawOS", "One account for Web and Desktop"];

  return (
    <div className="w-full" data-testid="signup-form" data-step={step}>
      <AuthHeading title={title} subtitle={subtitle} />

      {step === "details" && (
        <>
          <div className="mt-8">
            <ProviderRow pending={oauthPending} disabled={oauthPending !== null || loading} lastUsed={null} onSelect={oauth} />
          </div>
          <form onSubmit={submitDetails} className="mt-6 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className={labelClass}>
                  First name
                </label>
                <input id="firstName" type="text" autoComplete="given-name" required autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="Your first name" />
              </div>
              <div>
                <label htmlFor="lastName" className={labelClass}>
                  Last name
                </label>
                <input id="lastName" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Your last name" />
              </div>
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Your email address" />
            </div>
            {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
            <button type="submit" disabled={loading || oauthPending !== null} className={primaryButtonClass}>
              {loading ? <Spinner /> : "Continue"}
            </button>
          </form>
        </>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="mt-8 flex flex-col gap-4">
          <EmailChip email={email.trim()} onChange={backToDetails} />
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
        <form onSubmit={createAccount} className="mt-8 flex flex-col gap-4">
          <EmailChip email={email.trim()} onChange={backToDetails} />
          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="flex items-start gap-2.5 text-sm text-neutral-400">
              <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border border-neutral-600 bg-neutral-900" />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-neutral-200 underline-offset-2 hover:underline">
                  Terms of Service
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-neutral-400">
              <input type="checkbox" checked={agreedToPrivacy} onChange={(e) => setAgreedToPrivacy(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border border-neutral-600 bg-neutral-900" />
              <span>
                I acknowledge the{" "}
                <Link href="/privacy" target="_blank" className="text-neutral-200 underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={loading || !agreedToTerms || !agreedToPrivacy || password.length < 8} className={primaryButtonClass}>
            {loading ? <Spinner /> : "Create account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-neutral-400">
        Already have an account?{" "}
        <Link href={loginHref} className="text-neutral-200 underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
