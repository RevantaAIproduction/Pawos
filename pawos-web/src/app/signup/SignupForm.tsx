"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { GoogleGlyph, GitHubGlyph } from "../login/GoogleGitHubIcons";

export function SignupForm() {
  const [intent] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("intent") : null
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | "microsoft" | null>(null);
  const isDesktopWaitlist = intent === "pawos-desktop-waitlist";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate legal acceptance
    if (!agreedToTerms || !agreedToPrivacy) {
      setMessage("Please accept both the Terms of Service and Privacy Policy.");
      return;
    }

    setStatus("loading");
    setMessage(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      // If account was created, record legal acceptance in the database
      if (data.user) {
        try {
          // Get the new session token if available
          const token = data.session?.access_token;
          if (token) {
            await fetch("/api/auth/accept-legal", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                documentSlugs: ["terms", "privacy-policy"],
              }),
            });
          }
        } catch (acceptanceError) {
          console.warn("Failed to record legal acceptance:", acceptanceError);
          // Don't fail signup if acceptance recording fails — the user can accept later
        }
      }

      if (data.session) {
        // Email confirmation is off for this project — already signed in.
        window.location.href = "/dashboard";
        return;
      }
      setStatus("confirm");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong signing up.");
    }
  };

  const handleOAuth = async (provider: "google" | "github" | "microsoft") => {
    setOauthPending(provider);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === "microsoft" ? "azure" : provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setOauthPending(null);
        setMessage(error.message);
      }
    } catch (err) {
      setOauthPending(null);
      setMessage(err instanceof Error ? err.message : "Could not start sign-in.");
    }
  };

  if (status === "confirm") {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-sm text-neutral-400">
          We sent a confirmation link to <span className="text-neutral-200">{email}</span>. Click it to
          finish creating your PawOS account.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h1 className="text-2xl font-bold">
        {isDesktopWaitlist ? "Join the PawOS Desktop launch list" : "Create your PawOS account"}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        {isDesktopWaitlist
          ? "Create an account to explore PawOS now and receive launch updates when public installers are available."
          : "Same account works on the desktop app."}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={oauthPending !== null || status === "loading"}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          <GoogleGlyph size={18} />
          {oauthPending === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
        <button
          type="button"
          onClick={() => handleOAuth("github")}
          disabled={oauthPending !== null || status === "loading"}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          <GitHubGlyph size={18} />
          {oauthPending === "github" ? "Opening GitHub…" : "Continue with GitHub"}
        </button>
        <button
          type="button"
          onClick={() => handleOAuth("microsoft")}
          disabled={oauthPending !== null || status === "loading"}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
            <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
          </svg>
          {oauthPending === "microsoft" ? "Opening Microsoft…" : "Continue with Microsoft"}
        </button>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
        <div className="h-px flex-1 bg-neutral-800" />
        or
        <div className="h-px flex-1 bg-neutral-800" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
            placeholder="Ada Lovelace"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-400">
            Password
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

        <div className="flex flex-col gap-3 rounded-lg bg-neutral-950/50 p-3">
          <label className="flex items-start gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 rounded border border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-400"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-blue-400 hover:underline">
                Terms of Service
              </Link>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={agreedToPrivacy}
              onChange={(e) => setAgreedToPrivacy(e.target.checked)}
              className="mt-1 rounded border border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-400"
            />
            <span>
              I acknowledge the{" "}
              <Link href="/privacy" target="_blank" className="text-blue-400 hover:underline">
                Privacy Policy
              </Link>
            </span>
          </label>
        </div>

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading" || oauthPending !== null || !agreedToTerms || !agreedToPrivacy}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-400 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
