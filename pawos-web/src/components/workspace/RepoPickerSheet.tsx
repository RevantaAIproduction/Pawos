"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CodeChangeReadiness, SelectedRepository } from "../../lib/webCode/repository";

type Repo = { fullName: string; defaultBranch: string; private: boolean };

/**
 * Choose the GitHub repository PawOS Web makes code changes in. The list comes from the server
 * (the account's own GitHub connection — repositories it can push to); choosing one is checked
 * with GitHub again on the server before it is saved. A bottom sheet on phones, a dialog on larger
 * screens.
 */
export function RepoPickerSheet({ current, onClose, onSelected }: { current: SelectedRepository | null; onClose: () => void; onSelected: (readiness: CodeChangeReadiness) => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/web/github/repositories", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; repositories?: Repo[]; message?: string };
        if (!alive) return;
        if (response.ok && data.ok && data.repositories) setRepos(data.repositories);
        else setError(data.message ?? "Couldn't load your repositories.");
      } catch {
        if (alive) setError("Couldn't reach PawOS. Check your connection and try again.");
      }
    })();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (repos ?? []).filter((repo) => !needle || repo.fullName.toLowerCase().includes(needle)).slice(0, 100);
  }, [repos, query]);

  const choose = async (repo: Repo) => {
    if (saving) return;
    setSaving(repo.fullName);
    setError(null);
    try {
      const response = await fetch("/api/web/github/repository", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: repo.fullName }) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; readiness?: CodeChangeReadiness; message?: string };
      if (response.ok && data.ok && data.readiness) {
        onSelected(data.readiness);
        return;
      }
      setError(data.message ?? "Couldn't choose that repository.");
    } catch {
      setError("Couldn't reach PawOS. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="repo-picker-title">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-neutral-800 bg-[#1b1b1b] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="repo-picker-title" className="text-base font-medium text-white">
            Choose a repository
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-400">PawOS Web changes code here and pushes it. Only repositories you can push to are listed.</p>

        <label htmlFor="repo-search" className="sr-only">
          Search repositories
        </label>
        <input
          id="repo-search"
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search repositories"
          autoComplete="off"
          className="mt-4 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-base text-neutral-100 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none md:text-sm"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {error && (
            <p role="alert" className="py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {!repos && !error && (
            <p role="status" className="py-4 text-sm text-neutral-500">
              Loading your repositories…
            </p>
          )}
          {repos && shown.length === 0 && <p className="py-4 text-sm text-neutral-500">{repos.length === 0 ? "No repositories you can push to were found on your GitHub account." : "No repositories match."}</p>}
          <ul className="divide-y divide-neutral-800/80">
            {shown.map((repo) => (
              <li key={repo.fullName}>
                <button
                  type="button"
                  onClick={() => void choose(repo)}
                  disabled={saving !== null}
                  className="flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left hover:bg-neutral-800/60 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-neutral-100">{repo.fullName}</span>
                    <span className="block text-xs text-neutral-500">
                      {repo.private ? "Private" : "Public"} · {repo.defaultBranch}
                    </span>
                  </span>
                  {saving === repo.fullName ? (
                    <span className="text-xs text-neutral-400">Checking…</span>
                  ) : current?.fullName === repo.fullName ? (
                    <span className="text-xs text-emerald-400">Selected</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
