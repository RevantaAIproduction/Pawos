"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "../../lib/supabase/client";
import { GoogleGlyph, GitHubGlyph } from "./GoogleGitHubIcons";

/** Shared pieces of the /login and /signup pages: provider buttons, inputs, "last used" and `next`. */

export type AuthMethod = "google" | "github" | "email";

const LAST_USED_KEY = "pawos:auth:lastUsed";

export function rememberAuthMethod(method: AuthMethod): void {
  try {
    window.localStorage.setItem(LAST_USED_KEY, method);
  } catch {
    // Private windows and blocked storage: "Last used" is only a convenience.
  }
}

function readLastUsed(): AuthMethod | null {
  try {
    const value = window.localStorage.getItem(LAST_USED_KEY);
    return value === "google" || value === "github" || value === "email" ? value : null;
  } catch {
    return null;
  }
}

/** The method this browser last signed in with, or null (always null while server rendering). */
export function useLastUsedMethod(): AuthMethod | null {
  return useSyncExternalStore(
    () => () => {},
    readLastUsed,
    () => null
  );
}

/**
 * Where to go after signing in: only a same-origin path (never an absolute or protocol-relative URL,
 * which would make the login page an open redirect). Defaults to the dashboard.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function startOAuth(provider: "google" | "github", next: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next !== "/dashboard") callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback.toString() } });
    if (error) return error.message;
    rememberAuthMethod(provider);
    return null; // Supabase navigates the browser away.
  } catch (err) {
    return err instanceof Error ? err.message : "Could not start sign-in.";
  }
}

const PROVIDERS = [
  { id: "google" as const, label: "Continue with Google", Icon: GoogleGlyph },
  { id: "github" as const, label: "Continue with GitHub", Icon: GitHubGlyph },
];

export function ProviderRow({
  pending,
  disabled,
  lastUsed,
  onSelect,
}: {
  pending: "google" | "github" | null;
  disabled: boolean;
  lastUsed: AuthMethod | null;
  onSelect: (provider: "google" | "github") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PROVIDERS.map(({ id, label, Icon }) => (
        <div key={id} className="relative">
          {lastUsed === id && (
            <span className="absolute -top-2.5 left-2 z-10 rounded-md border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[11px] font-medium text-neutral-200">
              Last used
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelect(id)}
            disabled={disabled}
            aria-label={label}
            title={label}
            data-testid={`oauth-${id}`}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-neutral-900 text-neutral-100 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
          >
            {pending === id ? <Spinner /> : <Icon size={18} />}
          </button>
        </div>
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-500 border-t-neutral-100" aria-hidden="true" />;
}

export const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-transparent px-3 py-2.5 text-base text-neutral-100 placeholder-neutral-500 outline-none transition focus:border-neutral-400 md:text-sm";

export const labelClass = "mb-1.5 block text-sm font-medium text-neutral-400";

export const primaryButtonClass =
  "flex h-11 w-full items-center justify-center rounded-lg bg-neutral-800 text-sm font-semibold text-white transition hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50";

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="text-2xl font-semibold tracking-tight text-neutral-500">{subtitle}</p>
    </div>
  );
}

/** The chosen email, shown on the password step with a way back to change it. */
export function EmailChip({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2.5">
      <span className="min-w-0 truncate text-sm text-neutral-200" data-testid="chosen-email">
        {email}
      </span>
      <button type="button" onClick={onChange} className="shrink-0 text-sm text-neutral-400 underline-offset-2 hover:text-white hover:underline">
        Change
      </button>
    </div>
  );
}


/** The 6-digit email code: one field, numbers only, fills from the keyboard's one-time-code suggestion. */
export function CodeInput({ value, onChange, autoFocus = true }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <input
      id="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      className={`${inputClass} text-center font-mono text-xl tracking-[0.5em]`}
      placeholder="000000"
      aria-label="6-digit code"
      data-testid="code-input"
    />
  );
}
