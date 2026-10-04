"use client";

import { useEffect, useRef, useState } from "react";
import type { CodeChangeStep, CodeChangeView } from "../../lib/webCode/codeChange";

const POLL_MS = 2_500;
const LIVE_STATES = new Set(["running", "pushed", "fixing"]);

/** Asks the server for a change until it is finished. A 404 means it hasn't been recorded yet. */
export function useCodeChange(requestId: string | null, initial: CodeChangeView | null): CodeChangeView | null {
  const [change, setChange] = useState<CodeChangeView | null>(initial);
  const [seen, setSeen] = useState({ requestId, initial });
  if (seen.requestId !== requestId || seen.initial !== initial) {
    setSeen({ requestId, initial });
    setChange(initial && initial.requestId === requestId ? initial : null);
  }
  const live = requestId !== null && (change === null || LIVE_STATES.has(change.state));

  useEffect(() => {
    if (!requestId || !live) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/web/changes/${encodeURIComponent(requestId)}`, { cache: "no-store" });
          const data = (await response.json().catch(() => ({}))) as { ok?: boolean; change?: CodeChangeView };
          if (alive && response.ok && data.change) setChange(data.change);
        } catch {
          // offline for a moment: ask again on the next tick
        }
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, live]);

  return change;
}

function StepIcon({ status }: { status: CodeChangeStep["status"] }) {
  if (status === "active") {
    return <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-500 border-t-neutral-100" aria-hidden="true" />;
  }
  if (status === "done") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-neutral-400" aria-hidden="true">
        <path d="M4 12.5l4.5 4.5L20 6" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0 text-red-400" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-neutral-600" aria-hidden="true" />;
}

const STATUS_TEXT: Record<CodeChangeStep["status"], string> = { pending: "to do", active: "in progress", done: "done", failed: "failed", skipped: "skipped" };

function StepList({ steps }: { steps: CodeChangeStep[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((step) => (
        <li key={step.id} className="flex gap-2.5">
          <StepIcon status={step.status} />
          <span className="min-w-0">
            <span className={`block text-sm ${step.status === "done" || step.status === "skipped" ? "text-neutral-500 line-through" : step.status === "failed" ? "text-red-300" : "text-neutral-100"}`}>
              {step.label}
              <span className="sr-only"> — {STATUS_TEXT[step.status]}</span>
            </span>
            {step.detail && <span className="mt-0.5 block break-words text-xs text-neutral-500">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Links({ change }: { change: CodeChangeView }) {
  const link = "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium md:min-h-8";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {change.previewUrl && (
        <a href={change.previewUrl} target="_blank" rel="noopener noreferrer" className={`${link} bg-neutral-100 text-black hover:bg-white`}>
          Open preview
        </a>
      )}
      {change.pullRequestUrl ? (
        <a href={change.pullRequestUrl} target="_blank" rel="noopener noreferrer" className={`${link} border border-neutral-700 text-neutral-200 hover:bg-neutral-800`}>
          Pull request
        </a>
      ) : (
        change.commitUrl && (
          <a href={change.commitUrl} target="_blank" rel="noopener noreferrer" className={`${link} border border-neutral-700 text-neutral-200 hover:bg-neutral-800`}>
            Commit
          </a>
        )
      )}
    </div>
  );
}

function headline(change: CodeChangeView | null): string {
  if (!change) return "Starting…";
  if (change.state === "done") return change.checksState === "none" ? "Pushed" : "Done";
  if (change.state === "failed") return change.commitSha ? "Pushed — checks failing" : "Stopped";
  if (change.state === "fixing") return "Fixing a failed check…";
  if (change.state === "pushed") return "Pushed — waiting for preview";
  return "Working…";
}

/**
 * The live task list for a code change — what PawOS Web is doing and has done, step by step, from
 * the server's own record. On large screens a panel on the right; on phones a card that folds.
 */
export function TaskPanel({ change, onClose, notify = true }: { change: CodeChangeView | null; onClose: () => void; /** One panel per page notifies. */ notify?: boolean }) {
  const [open, setOpen] = useState(true);
  const notifiedRef = useRef<string | null>(null);

  // Tell the user when it's finished, if they've switched away.
  useEffect(() => {
    if (!notify || !change || (change.state !== "done" && change.state !== "failed") || notifiedRef.current === `${change.requestId}:${change.state}`) return;
    notifiedRef.current = `${change.requestId}:${change.state}`;
    try {
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        new Notification(change.state === "done" ? "PawOS: change done" : "PawOS: change needs attention", { body: `${change.repository}${change.summary ? ` — ${change.summary}` : ""}`, icon: "/logo-icon.png" });
      }
    } catch {
      // notifications are a convenience
    }
  }, [change, notify]);

  const steps = change?.steps ?? [];
  const finished = steps.filter((step) => step.status === "done" || step.status === "skipped").length;

  return (
    <section aria-label="Plan" data-testid="task-panel" className="rounded-xl border border-neutral-800 bg-[#1b1b1b] p-4 lg:rounded-none lg:border-0 lg:border-l lg:bg-[#171717] lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left lg:pointer-events-none lg:min-h-0">
          <span className="text-sm font-medium text-neutral-200">Plan</span>
          <span className="truncate text-xs text-neutral-500" role="status">
            {headline(change)}
            {steps.length > 0 ? ` · ${finished}/${steps.length}` : ""}
          </span>
        </button>
        <button type="button" onClick={onClose} aria-label="Close plan" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-white md:h-8 md:w-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className={`${open ? "block" : "hidden"} lg:block`}>
        {change && <p className="mt-2 truncate text-xs text-neutral-500">{change.repository}</p>}
        <p className="mb-3 mt-4 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Tasks</p>
        {steps.length > 0 ? <StepList steps={steps} /> : <p className="text-sm text-neutral-500">Getting started…</p>}
        {change && <Links change={change} />}
      </div>
    </section>
  );
}
