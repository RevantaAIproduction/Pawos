"use client";

import Link from "next/link";
import type { CodeChangeReadiness } from "../../lib/webCode/repository";

/**
 * "Change code" mode: what has to happen before Paw can change code, as a numbered checklist
 * (connect GitHub → choose a repository → start coding), and once it's ready, the repository and
 * branch every change goes to — always visible, so it's clear where a change will land.
 */

type StepState = "done" | "current" | "todo";

function StepMark({ state, index }: { state: StepState; index: number }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
        state === "current" ? "border-blue-400 text-blue-300" : "border-neutral-700 text-neutral-500"
      }`}
      aria-hidden="true"
    >
      {index}
    </span>
  );
}

function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6M11.5 7c0 2.5-2.5 3-7 4" />
    </svg>
  );
}

export function RepoStatus({ readiness, busy, onChooseRepository }: { readiness: CodeChangeReadiness; busy: boolean; onChooseRepository: () => void }) {
  if (readiness.state === "locked") return null;

  if (readiness.state === "ready") {
    const { fullName, defaultBranch } = readiness.repository;
    return (
      <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2" data-testid="change-status">
        <span className="text-neutral-400">
          <GitHubIcon />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={`https://github.com/${fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-sm font-medium text-white hover:underline"
            title="Open the repository on GitHub"
          >
            {fullName}
          </a>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/60 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
            title="Changes are committed and pushed to this branch"
            data-testid="current-branch"
          >
            <BranchIcon />
            {defaultBranch}
          </span>
          <span className="hidden text-xs text-neutral-500 sm:inline">Changes are pushed to this branch</span>
        </div>
        <button
          type="button"
          onClick={onChooseRepository}
          disabled={busy}
          aria-label="Choose another repository"
          className="inline-flex min-h-10 shrink-0 items-center rounded-md px-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:opacity-50 md:min-h-8"
        >
          Switch
        </button>
      </div>
    );
  }

  // Not ready yet: the steps, with the next one to do highlighted.
  const githubOk = readiness.state === "noRepository";
  const steps: { title: string; detail: string; state: StepState; action?: React.ReactNode }[] = [
    {
      title: readiness.state === "githubNeedsReauth" ? "Reconnect GitHub" : "Connect GitHub",
      detail: readiness.state === "githubNeedsReauth" ? "Your GitHub connection needs to be renewed." : "Sign in with GitHub so Paw can work in your repositories.",
      state: githubOk ? "done" : "current",
      action: githubOk ? null : (
        <Link
          href="/dashboard/integrations"
          className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 md:min-h-8"
        >
          {readiness.state === "githubNeedsReauth" ? "Reconnect GitHub" : "Connect GitHub"}
        </Link>
      ),
    },
    {
      title: "Select a repository",
      detail: "Choose the repository Paw changes. You'll see it and its branch here.",
      state: githubOk ? "current" : "todo",
      action: githubOk ? (
        <button
          type="button"
          onClick={onChooseRepository}
          className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 md:min-h-8"
        >
          Choose repository
        </button>
      ) : null,
    },
    { title: "Start coding", detail: "Describe the change below. Paw writes it, checks it and pushes it.", state: "todo" },
  ];

  return (
    <div className="mb-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3" data-testid="change-status">
      <p className="text-sm font-medium text-white">Before you start coding</p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3" aria-current={step.state === "current" ? "step" : undefined}>
            <StepMark state={step.state} index={index + 1} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${step.state === "todo" ? "text-neutral-500" : "font-medium text-neutral-100"}`}>
                {step.title}
                {step.state === "done" && <span className="sr-only"> (done)</span>}
              </p>
              {step.state !== "done" && <p className="mt-0.5 text-xs text-neutral-500">{step.detail}</p>}
              {step.action && <div className="mt-2">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
