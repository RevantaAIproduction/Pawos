"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { GoogleGlyph, GitHubGlyph } from "./GoogleGitHubIcons";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState<"google" | "github" | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong signing in.");
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
      // On success Supabase navigates the browser away — nothing else to do here.
    } catch (err) {
      setOauthPending(null);
      setMessage(err instanceof Error ? err.message : "Could not start sign-in.");
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h1 className="text-2xl font-bold">Log in to PawOS</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Manage your account, plan, and task credits from the web.
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
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
        <div className="h-px flex-1 bg-neutral-800" />
        or
        <div className="h-px flex-1 bg-neutral-800" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-medium text-neutral-400">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-blue-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
            placeholder="••••••••"
          />
        </div>

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading" || oauthPending !== null}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-blue-400 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
