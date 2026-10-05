"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "../../../lib/supabase/client";
import { Panel, Row, dangerButton, inputClasses, secondaryButton } from "../../../components/dashboard/ui";

type Blocker = { code: string; message: string };
type Step = "idle" | "confirm";

/**
 * Settings → Delete account. Two steps, both checked on the server (see accountDeletion.ts):
 *  1. "Delete account" → POST /api/dashboard/account/delete-code. If money is still owed or the
 *     account owns an organization, the reasons are listed and no code is sent.
 *  2. Enter the emailed code and type the email → DELETE /api/dashboard/account.
 */
export function DeleteAccountPanel({ email }: { email: string }) {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const requestCode = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setBlockers([]);
    try {
      const response = await fetch("/api/dashboard/account/delete-code", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; blockers?: Blocker[] };
      if (response.ok && data.ok) {
        setStep("confirm");
        setCode("");
        setMessage({ kind: "info", text: `We sent a 6-digit code to ${email}. It expires in 10 minutes.` });
      } else if (data.blockers?.length) {
        setStep("idle");
        setBlockers(data.blockers);
      } else {
        setMessage({ kind: "error", text: data.message ?? "Could not start account deletion. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, confirmEmail }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string; blockers?: Blocker[] };
      if (response.ok && data.ok) {
        await createClient().auth.signOut().catch(() => undefined);
        window.location.href = "/?account=deleted";
        return;
      }
      if (data.blockers?.length) {
        setStep("idle");
        setBlockers(data.blockers);
      } else {
        if (data.code === "code_invalid" || data.code === "code_expired") setCode("");
        setMessage({ kind: "error", text: data.message ?? "Could not delete your account. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    }
    setBusy(false);
  };

  const cancel = () => {
    setStep("idle");
    setCode("");
    setConfirmEmail("");
    setMessage(null);
  };

  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  return (
    <Panel className="border-red-500/30">
      <Row
        label="Delete account"
        hint="Permanently deletes your PawOS account and everything in it: your email, chats, history, files, connections, credits, and your payment and invoice records. Your subscription is cancelled. This can't be undone. Accounts with unpaid payments can't be deleted until they're paid."
        align="start"
      >
        {step === "idle" && (
          <button type="button" onClick={() => void requestCode()} disabled={busy} className={dangerButton} data-testid="delete-account-start">
            {busy ? "Checking…" : "Delete account"}
          </button>
        )}
      </Row>

      {blockers.length > 0 && (
        <div className="px-4 py-4 sm:px-5" role="alert" data-testid="delete-account-blockers">
          <p className="text-sm font-medium text-amber-300">Your account can&apos;t be deleted yet:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            {blockers.map((b) => (
              <li key={b.message}>{b.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-neutral-500">Your account stays active and you can keep using PawOS.</p>
        </div>
      )}

      {step === "confirm" && (
        <form onSubmit={confirmDelete} className="space-y-4 px-4 py-4 sm:px-5" data-testid="delete-account-confirm">
          <div>
            <label htmlFor="delete-account-code" className="text-sm font-medium text-neutral-100">
              Code from the email
            </label>
            <input
              id="delete-account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${inputClasses} mt-1.5 max-w-[12rem] tracking-[0.4em]`}
              placeholder="000000"
            />
          </div>
          <div>
            <label htmlFor="delete-account-email" className="text-sm font-medium text-neutral-100">
              Type <span className="break-all font-mono text-neutral-300">{email}</span> to confirm
            </label>
            <input
              id="delete-account-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className={`${inputClasses} mt-1.5`}
              placeholder={email}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.length !== 6 || !emailMatches} className={dangerButton} data-testid="delete-account-submit">
              {busy ? "Deleting…" : "Permanently delete my account"}
            </button>
            <button type="button" onClick={() => void requestCode()} disabled={busy} className={secondaryButton}>
              Send a new code
            </button>
            <button type="button" onClick={cancel} disabled={busy} className={secondaryButton}>
              Keep my account
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className={`px-4 py-3 text-sm sm:px-5 ${message.kind === "error" ? "text-red-400" : "text-neutral-300"}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </Panel>
  );
}
