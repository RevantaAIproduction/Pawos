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
  rememberAuthMethod,
  safeNextPath,
  startOAuth,
} from "../login/AuthPieces";

/**
 * Sign up: Google or GitHub in one click, or email — first and last name and the email first
 * ("Continue"), then a password and the Terms/Privacy acceptance. The same account signs in to
 * PawOS Desktop.
 */
export function SignupForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const isDesktopWaitlist = params.get("intent") === "pawos-desktop-waitlist";

  const [step, setStep] = useState<"details" | "password">("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "confirm">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (step === "password" ? passwordRef : firstNameRef).current?.focus();
  }, [step]);

  const continueToPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setStep("password");
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms || !agreedToPrivacy) {
      setMessage("Please accept the Terms of Service and the Privacy Policy.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const callback = new URL("/auth/callback", window.location.origin);
      if (next !== "/dashboard") callback.searchParams.set("next", next);
      const { data, error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName, first_name: firstName.trim(), last_name: lastName.trim() },
          emailRedirectTo: callback.toString(),
        },
      });
      if (error) {
        setStatus("idle");
        setMessage(error.message);
        return;
      }

      // Record the legal acceptance now that the account exists (it can be accepted later if this fails).
      const token = data.session?.access_token;
      if (data.user && token) {
        await fetch("/api/auth/accept-legal", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ documentSlugs: ["terms", "privacy-policy"] }),
        }).catch((acceptanceError) => console.warn("Failed to record legal acceptance:", acceptanceError));
      }

      rememberAuthMethod("email");
      if (data.session) {
        window.location.href = next;
        return;
      }
      setStatus("confirm");
    } catch (err) {
      setStatus("idle");
      setMessage(err instanceof Error ? err.message : "Something went wrong signing up.");
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

  if (status === "confirm") {
    return (
      <div className="w-full" data-testid="signup-confirm">
        <AuthHeading title="Check your email" subtitle="One more step" />
        <p className="mt-6 text-sm leading-relaxed text-neutral-400">
          We sent a confirmation link to <span className="text-neutral-200">{email}</span>. Open it to finish creating your PawOS
          account.
        </p>
      </div>
    );
  }

  const loginHref = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="w-full" data-testid="signup-form">
      <AuthHeading
        title={isDesktopWaitlist ? "Join the PawOS Desktop launch list" : "Welcome to PawOS"}
        subtitle={isDesktopWaitlist ? "Get launch updates" : "One account for Web and Desktop"}
      />

      <div className="mt-8">
        <ProviderRow pending={oauthPending} disabled={oauthPending !== null || status === "loading"} lastUsed={null} onSelect={oauth} />
      </div>

      {step === "details" ? (
        <form onSubmit={continueToPassword} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className={labelClass}>
                First name
              </label>
              <input
                ref={firstNameRef}
                id="firstName"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                placeholder="Your first name"
              />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                placeholder="Your last name"
              />
            </div>
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
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
            Continue
          </button>
        </form>
      ) : (
        <form onSubmit={createAccount} className="mt-6 flex flex-col gap-4">
          <EmailChip
            email={email}
            onChange={() => {
              setPassword("");
              setMessage(null);
              setStep("details");
            }}
          />
          <div>
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              ref={passwordRef}
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-start gap-2.5 text-sm text-neutral-400">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-neutral-200 underline-offset-2 hover:underline">
                  Terms of Service
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-neutral-400">
              <input
                type="checkbox"
                checked={agreedToPrivacy}
                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              <span>
                I acknowledge the{" "}
                <Link href="/privacy" target="_blank" className="text-neutral-200 underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>
          </div>

          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button
            type="submit"
            disabled={status === "loading" || oauthPending !== null || !agreedToTerms || !agreedToPrivacy}
            className={primaryButtonClass}
          >
            {status === "loading" ? <Spinner /> : "Create account"}
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
