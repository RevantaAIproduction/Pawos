"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { GoogleGlyph, GitHubGlyph } from "../login/GoogleGitHubIcons";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleOAuth = async (provider: "google" | "github") => {
    setOauthPending(provider);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
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
      <h1 className="text-2xl font-bold">Create your PawOS account</h1>
      <p className="mt-2 text-sm text-neutral-400">Same account works on the desktop app.</p>

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

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading" || oauthPending !== null}
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
