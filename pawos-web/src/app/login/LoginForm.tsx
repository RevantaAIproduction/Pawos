"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import {
  AuthHeading,
  EmailChip,
  ProviderRow,
  Spinner,
  inputClass,
  labelClass,
  primaryButtonClass,
  safeNextPath,
  rememberAuthMethod,
  startOAuth,
  useLastUsedMethod,
} from "./AuthPieces";

/**
 * Log in: Google or GitHub in one click, or email — the email first ("Continue with email"), then the
 * password. `?next=` (a same-origin path) is where the browser goes afterwards, e.g. back to the
 * PawOS Desktop sign-in page.
 */
export function LoginForm() {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | null>(null);
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [message, setMessage] = useState<string | null>(params.get("error"));
  const lastUsed = useLastUsedMethod();
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (step === "password" ? passwordRef : emailRef).current?.focus();
  }, [step]);

  const continueWithEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setStep("password");
  };

  const logIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setLoading(false);
        setMessage(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
        return;
      }
      rememberAuthMethod("email");
      window.location.href = next;
    } catch (err) {
      setLoading(false);
      setMessage(err instanceof Error ? err.message : "Something went wrong signing in.");
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

  const signupHref = next === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <div className="w-full" data-testid="login-form">
      <AuthHeading title="Welcome back to PawOS" subtitle="Pick up where you left off" />

      <div className="mt-8">
        <ProviderRow pending={oauthPending} disabled={oauthPending !== null || loading} lastUsed={lastUsed} onSelect={oauth} />
      </div>

      {step === "email" ? (
        <form onSubmit={continueWithEmail} className="mt-6 flex flex-col gap-4">
          <div className="relative">
            {lastUsed === "email" && (
              <span className="absolute -top-2.5 right-2 rounded-md border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[11px] font-medium text-neutral-200">
                Last used
              </span>
            )}
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="Your email address"
            />
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={oauthPending !== null} className={primaryButtonClass}>
            Continue with email
          </button>
        </form>
      ) : (
        <form onSubmit={logIn} className="mt-6 flex flex-col gap-4">
          <EmailChip
            email={email}
            onChange={() => {
              setPassword("");
              setMessage(null);
              setStep("email");
            }}
          />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-neutral-400">
                Password
              </label>
              <Link href="/forgot-password" className="text-sm text-neutral-400 hover:text-white hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              ref={passwordRef}
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="Your password"
            />
          </div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" disabled={loading || oauthPending !== null} className={primaryButtonClass}>
            {loading ? <Spinner /> : "Log in"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link href={signupHref} className="text-neutral-200 underline-offset-2 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
