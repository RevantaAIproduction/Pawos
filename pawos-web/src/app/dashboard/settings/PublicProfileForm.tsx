"use client";

import { useState, type FormEvent } from "react";
import { inputClasses, primaryButton, secondaryButton } from "../../../components/dashboard/ui";

export interface PublicProfileSettings {
  handle: string;
  publicProfileEnabled: boolean;
  displayName: string | null;
  bio: string | null;
  links: { label: string; url: string }[];
  publicUrl: string;
}

const MAX_LINKS = 5;

/**
 * Public profile settings: the on/off switch, the handle behind the public URL, and the few
 * fields the owner chooses to show. Saved through PUT /api/dashboard/profile; the URL shown is the
 * one the server returned for the saved handle.
 */
export function PublicProfileForm({ initial }: { initial: PublicProfileSettings }) {
  const [saved, setSaved] = useState(initial);
  const [enabled, setEnabled] = useState(initial.publicProfileEnabled);
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [links, setLinks] = useState(initial.links);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, handle, displayName, bio, links: links.filter((link) => link.label.trim() || link.url.trim()) }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; profile?: PublicProfileSettings };
      if (response.ok && data.ok && data.profile) {
        setSaved(data.profile);
        setHandle(data.profile.handle);
        setLinks(data.profile.links);
        setEnabled(data.profile.publicProfileEnabled);
        setMessage({ kind: "info", text: data.profile.publicProfileEnabled ? "Saved. Your public profile is live." : "Saved. Your public profile is off." });
      } else {
        setMessage({ kind: "error", text: data.message ?? "Could not save your profile. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(saved.publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ kind: "error", text: "Could not copy. Select the link and copy it manually." });
    }
  };

  const updateLink = (index: number, patch: Partial<{ label: string; url: string }>) =>
    setLinks((current) => current.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-white"
        />
        <span>
          <span className="block text-sm font-medium text-neutral-100">Public profile</span>
          <span className="block text-sm text-neutral-400">
            When on, anyone with the link can see your name, picture, handle, Companion, bio and the links below. Your email, plan, usage and connections
            are never shown.
          </span>
        </span>
      </label>

      {saved.publicProfileEnabled ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Your public profile</p>
          <p className="mt-2 break-all font-mono text-sm text-neutral-200" data-testid="public-profile-url">
            {saved.publicUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={copyUrl}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href={`/u/${saved.handle}`} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
              View profile
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Your public profile is off. The link below won&apos;t show anything until you turn it on and save.</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-handle" className="mb-2 block text-sm font-medium text-neutral-300">
            Handle
          </label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-neutral-500">/u/</span>
            <input
              id="profile-handle"
              value={handle}
              disabled={saving}
              maxLength={30}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              className={inputClasses}
            />
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">3–30 lowercase letters, numbers or hyphens. Changing it changes your link.</p>
        </div>
        <div>
          <label htmlFor="profile-display-name" className="mb-2 block text-sm font-medium text-neutral-300">
            Display name <span className="ml-1 font-normal text-neutral-600">Optional</span>
          </label>
          <input
            id="profile-display-name"
            value={displayName}
            disabled={saving}
            maxLength={80}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Defaults to your account name"
            className={inputClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="profile-bio" className="mb-2 block text-sm font-medium text-neutral-300">
          Bio <span className="ml-1 font-normal text-neutral-600">Optional</span>
        </label>
        <textarea id="profile-bio" value={bio} disabled={saving} maxLength={280} rows={3} onChange={(event) => setBio(event.target.value)} className={`${inputClasses} resize-y`} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-300">
          Public links <span className="ml-1 font-normal text-neutral-600">Optional, up to {MAX_LINKS}</span>
        </legend>
        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label={`Link ${index + 1} label`}
                value={link.label}
                disabled={saving}
                maxLength={40}
                placeholder="Label"
                onChange={(event) => updateLink(index, { label: event.target.value })}
                className={`${inputClasses} sm:w-40`}
              />
              <input
                aria-label={`Link ${index + 1} URL`}
                value={link.url}
                disabled={saving}
                maxLength={300}
                placeholder="https://"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => updateLink(index, { url: event.target.value })}
                className={`${inputClasses} flex-1`}
              />
              <button type="button" className={secondaryButton} disabled={saving} onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        {links.length < MAX_LINKS && (
          <button type="button" className={`${secondaryButton} mt-3`} disabled={saving} onClick={() => setLinks((current) => [...current, { label: "", url: "" }])}>
            Add link
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={primaryButton} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {message && (
          <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-400" : "text-neutral-300"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
