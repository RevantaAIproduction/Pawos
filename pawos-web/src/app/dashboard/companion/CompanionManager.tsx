"use client";

import { useState } from "react";
import type { CompanionCatalogEntry } from "../../../lib/account/companionCatalog";
import { CompanionPreview3D } from "../../../components/dashboard/CompanionPreview3D";
import { Card, CardTitle, primaryButton } from "../../../components/dashboard/ui";

export type CatalogItem = CompanionCatalogEntry & { available: boolean };

export interface CompanionState {
  companionId: string | null;
  customCompanionName: string | null;
}

/**
 * Choose, preview and save the account's Companion. The saved value lives on the server
 * (PUT /api/dashboard/companion → account_profiles); nothing about the selection is kept in
 * browser storage. `selected` is only the in-page choice until Save succeeds.
 */
export function CompanionManager({ catalog, initial }: { catalog: CatalogItem[]; initial: CompanionState }) {
  const [saved, setSaved] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.companionId ?? catalog.find((entry) => entry.available)?.companionId ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const selectedEntry = catalog.find((entry) => entry.companionId === selected);
  const savedEntry = catalog.find((entry) => entry.companionId === saved.companionId);
  const dirty = selected !== null && selected !== saved.companionId;

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/companion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companionId: selected }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; current?: CompanionState };
      if (response.ok && data.ok && data.current) {
        setSaved({ companionId: data.current.companionId, customCompanionName: data.current.customCompanionName });
        setMessage({ kind: "info", text: "Saved. Your PawOS desktop app picks this up the next time it syncs." });
      } else {
        setMessage({ kind: "error", text: data.message ?? "Could not save your Companion. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardTitle>Preview</CardTitle>
        <div className="mt-4 aspect-square w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          {selectedEntry?.preview === "paw3d" ? (
            <CompanionPreview3D label={selectedEntry.displayName} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">Select a Companion to preview it.</div>
          )}
        </div>
        {selectedEntry && (
          <>
            <p className="mt-4 text-lg font-medium text-white">{selectedEntry.displayName}</p>
            <p className="mt-1 text-sm text-neutral-400">{selectedEntry.description}</p>
            {selectedEntry.animations.length > 0 && <p className="mt-3 text-xs text-neutral-500">Animations: {selectedEntry.animations.join(", ")}</p>}
          </>
        )}
      </Card>

      <Card className="lg:col-span-3">
        <CardTitle>Current Companion</CardTitle>
        <p className="mt-3 text-lg font-medium text-white" data-testid="current-companion">
          {savedEntry?.displayName ?? saved.customCompanionName ?? "None selected"}
        </p>
        {saved.companionId === null && saved.customCompanionName && (
          <p className="mt-1 text-sm text-neutral-400">
            Your desktop app is using a custom Companion made on that device. It can&apos;t be previewed or selected here; choosing one below replaces it.
          </p>
        )}

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-neutral-400">Choose a Companion</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {catalog.map((entry) => {
              const isSelected = entry.companionId === selected;
              return (
                <label
                  key={entry.companionId}
                  className={`relative block rounded-lg border p-4 transition ${
                    !entry.available
                      ? "cursor-not-allowed border-neutral-800 opacity-60"
                      : isSelected
                        ? "cursor-pointer border-neutral-400 bg-neutral-900"
                        : "cursor-pointer border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="companion"
                    value={entry.companionId}
                    checked={isSelected}
                    disabled={!entry.available || saving}
                    onChange={() => {
                      setSelected(entry.companionId);
                      setMessage(null);
                    }}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-neutral-100">{entry.displayName}</span>
                    {entry.companionId === saved.companionId && <span className="text-xs text-neutral-500">Current</span>}
                  </span>
                  <span className="mt-1 block text-sm text-neutral-400">{entry.description}</span>
                  {!entry.available && <span className="mt-2 block text-xs text-neutral-500">Available on a higher plan.</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" className={primaryButton} onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save Companion"}
          </button>
          {!dirty && !message && saved.companionId && <span className="text-sm text-neutral-500">This is your saved Companion.</span>}
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-400" : "text-neutral-300"}`}>
              {message.text}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
