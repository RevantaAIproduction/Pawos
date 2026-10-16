import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../auth/supabaseClient';
import {
  IMAGE_ASPECT_RATIOS,
  type GeneratedImageInfo,
  type ImageAllowance,
  type ImageAspectRatio,
  type ImageFailureActions,
  type ImageGenerateResult,
} from '../../../shared/images/ImageGenerationTypes';
import { imageChargedLine, imagePriceLine, newImageRequestId, nextImageRequestId } from './imageGeneratorText';
import styles from './imageGenerator.module.css';

/**
 * Generate an image, from the composer's + menu. The PawOS server decides everything that matters —
 * the price, whether the account can pay, the model call and where the image is kept — through the
 * same endpoint as PawOS Web. This dialog shows the price first, sends one request per Generate press
 * (a request that got no answer is re-sent with the same id, so it can never make or charge a second
 * image) and shows the result. Upgrade and Buy Credits open the app's existing plan and usage screens.
 */

async function sessionAccessToken(): Promise<string | null> {
  const supabase = await getSupabaseClient();
  let { data } = await supabase.auth.getSession();
  if (!data.session?.access_token && data.session?.refresh_token) {
    const refreshed = await supabase.auth.refreshSession();
    data = { session: refreshed.data.session };
  }
  return data.session?.access_token ?? null;
}

type Failure = { message: string; actions?: ImageFailureActions };

export interface ImageGeneratorDialogProps {
  initialPrompt: string;
  onClose: () => void;
  /** The app's existing plan screen. */
  onUpgrade?: () => void;
  /** The app's existing usage-credits purchase (Settings → Usage). */
  onBuyCredits?: () => void;
}

export function ImageGeneratorDialog({ initialPrompt, onClose, onUpgrade, onBuyCredits }: ImageGeneratorDialogProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [allowance, setAllowance] = useState<ImageAllowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState<GeneratedImageInfo | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const lastResultRef = useRef<ImageGenerateResult | null>(null);
  const busyRef = useRef(false);

  const loadAllowance = async (alive: () => boolean = () => true) => {
    try {
      const token = await sessionAccessToken();
      if (!token) return;
      const result = await ipc.imagesGetAllowance(token);
      if (alive() && result.ok) setAllowance(result.allowance);
    } catch {
      // The price line keeps saying it is checking; the server still decides at Generate.
    }
  };

  useEffect(() => {
    let alive = true;
    void loadAllowance(() => alive);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the dialog opens
  }, []);

  const generate = async () => {
    // A ref, not only state: two fast presses must never send two requests.
    if (busyRef.current || !prompt.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setSavedTo(null);
    try {
      const token = await sessionAccessToken();
      if (!token) {
        setFailure({ message: 'Your session has expired. Sign in again and retry.' });
        return;
      }
      const requestId = nextImageRequestId(requestIdRef.current, lastResultRef.current, newImageRequestId);
      requestIdRef.current = requestId;
      const result = await ipc.imagesGenerate({ requestId, prompt: prompt.trim(), aspectRatio }, token);
      lastResultRef.current = result;
      if (result.ok) setImage(result.image);
      else setFailure({ message: result.message, actions: result.actions });
      if (result.ok || result.answered) void loadAllowance();
    } catch {
      lastResultRef.current = { ok: false, answered: false, code: 'unreachable', message: '' };
      setFailure({ message: "Couldn't reach PawOS. Check your connection and try again — you won't be charged twice." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const save = async () => {
    if (!image || saving) return;
    setSaving(true);
    try {
      const token = await sessionAccessToken();
      if (!token) return;
      const result = await ipc.imagesSave(image.id, token);
      if (result.ok) setSavedTo(result.filePath);
      else if (!result.canceled) setFailure({ message: result.message ?? "Couldn't save the image." });
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="image-generator-title" data-testid="image-generator" data-interactive="true">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h2 id="image-generator-title" className={styles.title}>Generate an image</h2>
          <button type="button" className={styles.textButton} onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <label htmlFor="image-prompt" className={styles.label}>Describe the image</label>
        <textarea
          id="image-prompt"
          className={styles.prompt}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          rows={3}
          maxLength={2000}
          disabled={busy}
          placeholder="A watercolor lighthouse at dawn"
          autoFocus
        />

        <div className={styles.row}>
          <label htmlFor="image-ratio" className={styles.label}>Aspect ratio</label>
          <select
            id="image-ratio"
            className={styles.select}
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.currentTarget.value as ImageAspectRatio)}
            disabled={busy}
          >
            {IMAGE_ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
          <span className={styles.muted}>Standard (1K)</span>
        </div>

        <p className={styles.price} data-testid="image-price">{imagePriceLine(allowance)}</p>

        <button type="button" className={styles.primary} onClick={() => void generate()} disabled={busy || !prompt.trim()} data-testid="image-generate">
          {busy ? 'Generating…' : image ? 'Generate again' : 'Generate'}
        </button>

        {failure && (
          <div role="alert" className={styles.failure} data-testid="image-failure">
            <p>{failure.message}</p>
            {failure.actions && (failure.actions.upgrade || failure.actions.buyCredits) && (
              <div className={styles.actions}>
                {failure.actions.upgrade && onUpgrade && (
                  <button type="button" className={styles.actionButton} onClick={() => { onClose(); onUpgrade(); }} data-testid="image-upgrade">
                    Upgrade Plan
                  </button>
                )}
                {failure.actions.buyCredits && onBuyCredits && (
                  <button type="button" className={styles.actionButton} onClick={() => { onClose(); onBuyCredits(); }} data-testid="image-buy-credits">
                    Buy Credits
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {image && (
          <figure className={styles.result} data-testid="image-result">
            <GeneratedImageFrame
              key={image.id}
              src={image.dataUrl}
              alt={prompt.trim() || 'Generated image'}
              onDownload={() => void save()}
              downloading={saving}
            />
            <figcaption className={styles.caption}>
              <span data-testid="image-charged">{imageChargedLine(image)}</span>
              <button type="button" className={styles.textButton} onClick={() => void save()} disabled={saving} data-testid="image-save">
                {saving ? 'Saving…' : 'Save image'}
              </button>
            </figcaption>
            {savedTo && <p className={styles.muted}>Saved to {savedTo}</p>}
          </figure>
        )}
      </div>
    </div>
  );
  // Above the whole window, not inside the composer (whose blur would clip a fixed layer).
  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog;
}


type ZoomEvent = { type: string; key?: string; preventDefault: () => void; stopPropagation: () => void };

/**
 * A click, Enter or Space on the image flips its zoom — and goes no further, so it never opens another
 * view or reaches a handler around the image. Other keys pass through untouched.
 */
export function zoomOnEvent(event: ZoomEvent, setZoomed: (update: (zoomed: boolean) => boolean) => void): void {
  if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  setZoomed((zoomed) => !zoomed);
}

/**
 * The generated image: a click (or Enter / Space) zooms it to twice its size inside a scrolling frame
 * and back. The download button sits on the frame's top-right corner, so it stays put while zoomed.
 */
export function GeneratedImageFrame({ src, alt, onDownload, downloading }: { src: string; alt: string; onDownload: () => void; downloading: boolean }) {
  const [zoomed, setZoomed] = useState(false);
  const toggle = (event: ZoomEvent) => zoomOnEvent(event, setZoomed);
  return (
    <div className={styles.imageWrap}>
      <div className={styles.imageFrame} data-testid="image-frame">
        <img
          src={src}
          alt={alt}
          role="button"
          tabIndex={0}
          aria-pressed={zoomed}
          title={zoomed ? 'Zoom out' : 'Zoom in'}
          onClick={toggle}
          onKeyDown={toggle}
          className={`${styles.image} ${zoomed ? styles.imageZoomed : ''}`}
          data-testid="image-zoom"
        />
      </div>
      <div className={styles.imageOverlay}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
          }}
          disabled={downloading}
          aria-label="Download image"
          title="Download image"
          data-testid="image-download"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
