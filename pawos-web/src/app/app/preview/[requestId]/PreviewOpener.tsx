"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TaskPanel, useCodeChange } from "../../../../components/workspace/TaskPanel";

/**
 * The tab PawOS Web opens when a code change is sent. It shows the change's live steps, then goes
 * to the repository's own preview deployment as soon as GitHub reports one. Opened by the user's
 * tap on Send, so phone browsers allow it.
 */
export function PreviewOpener({ requestId }: { requestId: string }) {
  const change = useCodeChange(requestId, null);

  useEffect(() => {
    // Only an https URL the server read from GitHub's deployment records for this commit.
    if (change?.previewUrl?.startsWith("https://")) window.location.replace(change.previewUrl);
  }, [change?.previewUrl]);

  const noPreview = change && (change.state === "done" || change.state === "failed") && !change.previewUrl;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-xl font-medium text-white">Live preview</h1>
      <p className="mt-1.5 text-sm text-neutral-400">
        {change?.previewUrl
          ? "Opening your preview…"
          : noPreview
            ? change?.commitSha
              ? "Your repository didn't publish a preview deployment for this change. Connect it to Vercel or Netlify (or another host that reports deployments to GitHub) to get one."
              : "The change wasn't pushed, so there's nothing to preview."
            : "This tab opens your repository's preview deployment as soon as it's ready."}
      </p>
      <div className="mt-6">
        <TaskPanel change={change} onClose={() => window.close()} />
      </div>
      <Link href="/app" className="mt-6 inline-flex min-h-10 items-center text-sm text-neutral-300 underline underline-offset-2">
        Back to PawOS Web
      </Link>
    </div>
  );
}
