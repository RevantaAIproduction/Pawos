"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Stage = "idle" | "joining" | "joined" | "already" | "error";

const SIGNUP_URL = "/signup?intent=pawos-desktop-waitlist";

/**
 * "Download for Windows" trigger. Opens an in-page dialog that adds the
 * visitor to Windows early access — signed-in visitors join directly, others
 * are sent to sign up first. The installer link is emailed when access opens.
 */
export function DownloadWindowsButton({
  children,
  className = "",
  source = "website",
  onClose,
}: {
  children: ReactNode;
  className?: string;
  /** Where the click came from, recorded with the early-access request. */
  source?: string;
  /** Called after the dialog closes. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => {
    setOpen(false);
    onCloseRef.current?.();
  }, []);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && <DownloadDialog source={source} onClose={close} />}
    </>
  );
}

function DownloadDialog({ source, onClose }: { source: string; onClose: () => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [stage]);

  const join = useCallback(async () => {
    setStage("joining");
    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "windows", source }),
      });
      if (res.status === 401) {
        router.push(SIGNUP_URL);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; isNew?: boolean };
      if (!res.ok || !data.ok) {
        setStage("error");
        return;
      }
      setStage(data.isNew === false ? "already" : "joined");
    } catch {
      setStage("error");
    }
  }, [router, source]);

  const done = stage === "joined" || stage === "already";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-windows-title"
        className="relative w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 text-left shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-neutral-500 transition hover:bg-neutral-900 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="text-white">
            <path fill="currentColor" d="M3 5.5l7.5-1v7H3v-6zm8.5-1.15L21 3v8.5h-9.5V4.35zM3 12.5h7.5v7L3 18.5v-6zm8.5 0H21V21l-9.5-1.35V12.5z" />
          </svg>
        </div>

        {done ? (
          <>
            <h2 id="download-windows-title" className="text-2xl font-medium tracking-tight text-white">
              {stage === "already" ? "You’re already on the list" : "You’re on the list"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              We&apos;ll email your PawOS for Windows installer link as soon as your early access opens. Keep an eye on
              your inbox.
            </p>
            <div className="mt-8 flex justify-end">
              <button
                ref={primaryRef}
                type="button"
                onClick={onClose}
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-neutral-200"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="download-windows-title" className="text-2xl font-medium tracking-tight text-white">
              PawOS for Windows
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              PawOS for Windows is available through early access. Request access and we&apos;ll email your installer
              link as soon as it&apos;s ready for you.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-neutral-300">
              <li className="flex gap-3">
                <span className="text-neutral-600">1</span>Request early access with your PawOS account
              </li>
              <li className="flex gap-3">
                <span className="text-neutral-600">2</span>Get your installer link by email
              </li>
              <li className="flex gap-3">
                <span className="text-neutral-600">3</span>Install, sign in, and meet Paw
              </li>
            </ul>
            {stage === "error" && (
              <p role="alert" className="mt-6 text-sm text-red-400">
                Something went wrong. Please try again.
              </p>
            )}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900"
              >
                Not now
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={join}
                disabled={stage === "joining"}
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
                {stage === "joining" ? "Requesting…" : "Request early access"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
