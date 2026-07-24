"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords don't match.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const supabase = createClient();
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

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="mt-3 text-sm text-neutral-400">You can now log in with your new password.</p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Opened from your password reset email — enter a new password below.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-400">
            New password
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
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-neutral-400">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-blue-400"
          />
        </div>

        {message && <p className="text-sm text-red-400">{message}</p>}

        <button
          type="submit"
          disabled={status === "loading"}
          className="mt-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {status === "loading" ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
