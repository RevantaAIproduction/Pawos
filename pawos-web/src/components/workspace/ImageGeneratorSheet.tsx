"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Generate an image, from the chat composer. Everything that matters happens on the server
 * (POST /api/web/images/generate): what it costs, whether the account can pay, the model call, and
 * where the image is kept. This sheet shows the price first, sends one request per Generate press
 * (a retry of a failed send reuses its request id, so it can never make or charge a second image),
 * and shows the image from the account's own protected address.
 *
 * A bottom sheet on phones, a centred dialog on larger screens — the same frame as the hand-off sheet.
 */

const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "4:5", "5:4", "21:9"] as const;

type Allowance = { chargePc: number; funding: "buckets" | "free_then_credits" | "organization"; freeImagesLeft: number | null };
type Image = { id: string; url: string; chargedPc: number; funding: "free" | "bucket" | "organization"; aspectRatio: string };
type Failure = { message: string; actions?: { upgrade: boolean; buyCredits: boolean } };

const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** What one image will cost this account, in words. */
export function priceLine(allowance: Allowance | null): string {
  if (!allowance) return "Checking the price…";
  if (allowance.funding === "organization") return "Uses 1 unit of your organization's shared monthly usage.";
  if (allowance.funding === "free_then_credits" && allowance.freeImagesLeft !== null && allowance.freeImagesLeft > 0) {
    return `Free — ${allowance.freeImagesLeft} of 3 free images left.`;
  }
  if (allowance.funding === "free_then_credits") return `Uses ${allowance.chargePc} PC of your purchased credits.`;
  return `Uses ${allowance.chargePc} PC of your plan's usage.`;
}

/** What one finished image cost, in words. */
export function chargedLine(image: Image): string {
  if (image.funding === "free") return "Free image — no usage charged.";
  if (image.funding === "organization") return "Used 1 unit of your organization's shared usage.";
  return `Used ${image.chargedPc} PC.`;
}

export function ImageGeneratorSheet({ initialPrompt, onClose }: { initialPrompt: string; onClose: () => void }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("1:1");
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<Image | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // The request id of a send that did not get an answer: pressing Generate again re-asks the same one.
  const retryIdRef = useRef<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const loadAllowance = async () => {
    try {
      const response = await fetch("/api/web/images/allowance");
      const data = (await response.json().catch(() => ({}))) as Allowance & { ok?: boolean };
      if (response.ok && data.ok) setAllowance({ chargePc: data.chargePc, funding: data.funding, freeImagesLeft: data.freeImagesLeft });
    } catch {
      // The price line keeps saying it is checking; the server still decides at Generate.
    }
  };

  useEffect(() => {
    closeRef.current?.focus();
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/web/images/allowance");
        const data = (await response.json().catch(() => ({}))) as Allowance & { ok?: boolean };
        if (alive && response.ok && data.ok) setAllowance({ chargePc: data.chargePc, funding: data.funding, freeImagesLeft: data.freeImagesLeft });
      } catch {
        // The price line keeps saying it is checking; the server still decides at Generate.
      }
    })();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the sheet opens
  }, []);

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    const requestId = retryIdRef.current ?? newRequestId();
    retryIdRef.current = requestId;
    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch("/api/web/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, prompt: prompt.trim(), aspectRatio, imageSize: "1K" }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; code?: string; image?: Image; message?: string; actions?: Failure["actions"] } | null;
      if (!data || data.code === "processing") {
        // No real answer (a gateway page), or this request is still being made: keep the request id,
        // so Generate again picks up that image instead of making a second one.
        setFailure({ message: data?.message ?? "Couldn't reach PawOS. Check your connection and try again — you won't be charged twice." });
        return;
      }
      // An answer came back, whatever it said: the next Generate is a new request.
      retryIdRef.current = null;
      if (response.ok && data.ok && data.image) setImage(data.image);
      else setFailure({ message: data.message ?? "The image couldn't be generated. Please try again.", actions: data.actions });
      void loadAllowance();
    } catch {
      // No answer: keep the request id, so trying again cannot make a second image.
      setFailure({ message: "Couldn't reach PawOS. Check your connection and try again — you won't be charged twice." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 md:items-center" role="dialog" aria-modal="true" aria-labelledby="image-generator-title" data-testid="image-generator">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-950 p-5 md:max-w-xl md:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="image-generator-title" className="text-base font-semibold text-neutral-100">Generate an image</h2>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-md px-3 text-sm text-neutral-400 hover:text-white disabled:opacity-50">
            Close
          </button>
        </div>

        <label htmlFor="image-prompt" className="mt-4 block text-sm text-neutral-300">Describe the image</label>
        <textarea
          id="image-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          maxLength={2000}
          disabled={busy}
          placeholder="A watercolor lighthouse at dawn"
          className="mt-1.5 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-base text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none md:text-sm"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="image-ratio" className="text-sm text-neutral-300">Aspect ratio</label>
          <select
            id="image-ratio"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as (typeof ASPECT_RATIOS)[number])}
            disabled={busy}
            className="min-h-10 rounded-md border border-neutral-800 bg-neutral-900 px-2 text-sm text-neutral-100"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">Standard (1K)</span>
        </div>

        <p className="mt-3 text-sm text-neutral-400" data-testid="image-price">{priceLine(allowance)}</p>

        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || !prompt.trim()}
          className="mt-4 min-h-11 w-full rounded-full bg-neutral-100 px-4 text-sm font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {busy ? "Generating…" : image ? "Generate again" : "Generate"}
        </button>

        {failure && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" data-testid="image-failure">
            <p>{failure.message}</p>
            {failure.actions && (
              <div className="mt-2 flex flex-wrap gap-2">
                {failure.actions.upgrade && (
                  <Link href="/pricing" className="min-h-10 rounded-md border border-amber-400/40 px-3 py-2 font-medium text-amber-50 hover:bg-amber-500/10">
                    Upgrade Plan
                  </Link>
                )}
                {failure.actions.buyCredits && <span className="py-2 text-amber-200/80">Credits can be bought in PawOS Desktop (Settings → Usage).</span>}
              </div>
            )}
          </div>
        )}

        {image && (
          <figure className="mt-5" data-testid="image-result">
            <GeneratedImageFrame key={image.id} src={image.url} alt={prompt.trim() || "Generated image"} />
            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <span data-testid="image-charged">{chargedLine(image)}</span>
              <a href={`${image.url}?download=1`} className="min-h-10 rounded-md px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800">
                Download
              </a>
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}


type ZoomEvent = { type: string; key?: string; preventDefault: () => void; stopPropagation: () => void };

/**
 * A click, Enter or Space on the image flips its zoom — and goes no further, so it never opens another
 * view or reaches a handler around the image. Other keys pass through untouched.
 */
export function zoomOnEvent(event: ZoomEvent, setZoomed: (update: (zoomed: boolean) => boolean) => void): void {
  if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  setZoomed((zoomed) => !zoomed);
}

/**
 * The generated image: a click (or Enter / Space) zooms it to twice its size inside a scrolling frame
 * and back. The download button sits on the frame's top-right corner, so it stays put while zoomed,
 * and downloads the original image from the account's protected address.
 */
export function GeneratedImageFrame({ src, alt }: { src: string; alt: string }) {
  const [zoomed, setZoomed] = useState(false);
  const toggle = (event: ZoomEvent) => zoomOnEvent(event, setZoomed);
  return (
    <div className="relative">
      <div className="max-h-[70dvh] overflow-auto rounded-lg border border-neutral-800" data-testid="image-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- the account's own generated image, from its protected address */}
        <img
          src={src}
          alt={alt}
          role="button"
          tabIndex={0}
          aria-pressed={zoomed}
          title={zoomed ? "Zoom out" : "Zoom in"}
          onClick={toggle}
          onKeyDown={toggle}
          className={`block max-w-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 ${zoomed ? "w-[200%] cursor-zoom-out" : "w-full cursor-zoom-in"}`}
          data-testid="image-zoom"
        />
      </div>
      <div className="absolute right-2 top-2 flex gap-1">
        <a
          href={`${src}?download=1`}
          aria-label="Download image"
          title="Download image"
          onClick={(event) => event.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/55 text-neutral-300 backdrop-blur-sm hover:bg-black/75 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          data-testid="image-download"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
