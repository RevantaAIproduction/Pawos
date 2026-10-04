"use client";

import { useState, type FormEvent } from "react";
import { Panel, Row, inputClasses, primaryButton, secondaryButton } from "../../../components/dashboard/ui";

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
 * The editable half of the Profile panel: display name, handle, links, and the public-profile
 * switch. Saved through PUT /api/dashboard/profile; the URL shown is the one the server returned
 * for the saved handle.
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
    <form onSubmit={submit} noValidate>
      <Panel className="rounded-t-none border-t-0">
        <Row label={<label htmlFor="profile-display-name">Display name</label>}>
          <input
            id="profile-display-name"
            value={displayName}
            disabled={saving}
            maxLength={80}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Defaults to your account name"
            className={inputClasses}
          />
        </Row>

        <Row label={<label htmlFor="profile-handle">Handle</label>} hint="3–30 lowercase letters, numbers or hyphens.">
          <div className="flex w-full items-center gap-2">
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
        </Row>

        <Row label={<label htmlFor="profile-bio">Bio</label>} align="start">
          <textarea id="profile-bio" value={bio} disabled={saving} maxLength={280} rows={2} onChange={(event) => setBio(event.target.value)} className={`${inputClasses} resize-y`} />
        </Row>

        {links.map((link, index) => (
          <Row key={index} label={`Link ${index + 1}`}>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <input
                aria-label={`Link ${index + 1} label`}
                value={link.label}
                disabled={saving}
                maxLength={40}
                placeholder="Label"
                onChange={(event) => updateLink(index, { label: event.target.value })}
                className={`${inputClasses} sm:w-32`}
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
          </Row>
        ))}

        {links.length < MAX_LINKS && (
          <Row label="Links" hint={`Shown on your public profile. Up to ${MAX_LINKS}.`}>
            <button type="button" className={secondaryButton} disabled={saving} onClick={() => setLinks((current) => [...current, { label: "", url: "" }])}>
              Add link
            </button>
          </Row>
        )}

        <Row
          label="Public profile"
          hint="When on, anyone with the link can see your name, picture, handle, Companion, bio and links. Your email, plan, usage and connections are never shown."
          align="start"
        >
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Public profile"
            disabled={saving}
            onClick={() => setEnabled((value) => !value)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled ? "bg-neutral-100" : "bg-neutral-700"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${enabled ? "left-[18px] bg-black" : "left-0.5 bg-neutral-300"}`} />
          </button>
        </Row>

        {saved.publicProfileEnabled && (
          <Row label="Your public link" align="start">
            <div className="w-full sm:text-right">
              <p className="break-all font-mono text-sm text-neutral-200" data-testid="public-profile-url">
                {saved.publicUrl}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                <button type="button" className={secondaryButton} onClick={copyUrl}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a href={`/u/${saved.handle}`} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                  View profile
                </a>
              </div>
            </div>
          </Row>
        )}

        <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-3 sm:px-5">
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-400" : "text-neutral-300"}`}>
              {message.text}
            </span>
          )}
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Panel>
    </form>
  );
}
