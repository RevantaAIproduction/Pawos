"use client";

import { useEffect, useRef, useState } from "react";
import type { DesktopHandoff } from "../../lib/webPolicy/desktopHandoff";

const STORE_URL = "https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN";

/**
 * "Continue in PawOS Desktop" for one web chat. The hand-off comes from the server (GET
 * /api/web/handoff), built from the stored conversation. It says exactly what happens: PawOS
 * Desktop opens a new chat and the user pastes the conversation — the desktop app does not yet
 * load web chats by itself, and nothing here pretends otherwise.
 *
 * A bottom sheet on phones, a centred dialog on larger screens. On a touch device the "Open PawOS
 * Desktop" link is not offered (the desktop app isn't on a phone); copying is.
 */
export function HandoffSheet({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [handoff, setHandoff] = useState<DesktopHandoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Only ever mounted after a click, never server-rendered, so reading the pointer type here is safe.
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const closeRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/web/handoff?chat=${encodeURIComponent(chatId)}`);
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; handoff?: DesktopHandoff; message?: string };
        if (!alive) return;
        if (response.ok && data.ok && data.handoff) setHandoff(data.handoff);
        else setError(data.message ?? "Couldn't prepare this conversation. Please try again.");
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
  }, [chatId, onClose]);

  const copy = async () => {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.transcript);
      setCopied(true);
    } catch {
      // Clipboard access can be refused: select the text so it can be copied by hand.
      textRef.current?.focus();
      textRef.current?.select();
    }
  };

  const button = "inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium md:min-h-9";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl border border-neutral-800 bg-[#1b1b1b] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="handoff-title" className="text-base font-medium text-white">
            Continue in PawOS Desktop
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          PawOS Desktop does the work on your computer — reading your code, running commands and tests, making the changes. Copy this conversation, then paste it into a new chat in PawOS Desktop.
        </p>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        ) : !handoff ? (
          <p role="status" className="mt-4 text-sm text-neutral-500">
            Preparing the conversation…
          </p>
        ) : (
          <>
            <label htmlFor="handoff-transcript" className="sr-only">
              Conversation to paste into PawOS Desktop
            </label>
            <textarea
              id="handoff-transcript"
              ref={textRef}
              readOnly
              value={handoff.transcript}
              rows={6}
              className="mt-4 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-base text-neutral-300 md:text-xs"
            />
            {handoff.truncated && <p className="mt-1 text-xs text-neutral-500">Long conversation: the most recent messages are included.</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={copy} className={`${button} bg-neutral-100 text-black hover:bg-white`}>
                {copied ? "Copied" : "Copy conversation"}
              </button>
              {!touch && (
                <a href={handoff.desktopUrl} className={`${button} border border-neutral-700 text-neutral-100 hover:bg-neutral-800`}>
                  Open PawOS Desktop
                </a>
              )}
              <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className={`${button} text-neutral-300 hover:bg-neutral-800`}>
                Get PawOS Desktop
              </a>
            </div>
            {touch && <p className="mt-3 text-xs text-neutral-500">On your computer, open PawOS Desktop and paste the conversation into a new chat. This chat also stays here in PawOS Web.</p>}
          </>
        )}
      </div>
    </div>
  );
}
