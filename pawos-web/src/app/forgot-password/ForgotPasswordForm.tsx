"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-sm text-neutral-400">
          If an account exists for <span className="text-neutral-200">{email}</span>, a password reset
          link is on its way.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-2 text-sm text-neutral-400">We&apos;ll email you a link to set a new one.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
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

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading"}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        <Link href="/login" className="text-blue-400 hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
