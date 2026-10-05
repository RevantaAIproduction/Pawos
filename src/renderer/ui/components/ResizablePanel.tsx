import React, { useCallback, useState } from 'react';

/**
 * Width of a right-side panel that the user can drag to resize (from its left edge), remembered per
 * panel. Double-click the edge to go back to the default width.
 */
export function clampWidth(width: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(width, min), Math.max(min, max)));
}

function readSaved(storageKey: string): number | null {
  try {
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  /** A number, or a function of the window width (e.g. leave room for the content beside it). */
  maxWidth: number | ((viewportWidth: number) => number);
}) {
  const max = useCallback(() => (typeof maxWidth === 'function' ? maxWidth(window.innerWidth) : maxWidth), [maxWidth]);
  const [width, setWidth] = useState<number>(() => clampWidth(readSaved(storageKey) ?? defaultWidth, minWidth, max()));

  const save = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        // Storage blocked: the width just isn't remembered.
      }
    },
    [storageKey]
  );

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;
      let latest = startWidth;
      const previousCursor = document.body.style.cursor;
      const previousSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (move: PointerEvent) => {
        // The panel's left edge: dragging left makes it wider.
        latest = clampWidth(startWidth + (startX - move.clientX), minWidth, max());
        setWidth(latest);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelect;
        save(latest);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, minWidth, max, save]
  );

  const nudge = useCallback(
    (delta: number) => {
      const next = clampWidth(width + delta, minWidth, max());
      setWidth(next);
      save(next);
    },
    [width, minWidth, max, save]
  );

  const reset = useCallback(() => {
    const next = clampWidth(defaultWidth, minWidth, max());
    setWidth(next);
    save(next);
  }, [defaultWidth, minWidth, max, save]);

  return { width, startResize, reset, nudge };
}

/** The draggable left edge of a right-side panel. Its parent must be positioned (relative/fixed). */
export function ResizeHandle({
  label = 'Resize panel',
  onPointerDown,
  onReset,
  onNudge,
}: {
  label?: string;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onReset: () => void;
  onNudge: (delta: number) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        // Keyboard: arrows resize (left = wider), Home/Enter resets.
        if (event.key === 'ArrowLeft') onNudge(24);
        else if (event.key === 'ArrowRight') onNudge(-24);
        else if (event.key === 'Home' || event.key === 'Enter') onReset();
        else return;
        event.preventDefault();
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      data-testid="panel-resize-handle"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: -3,
        width: 6,
        cursor: 'col-resize',
        zIndex: 5,
        background: hover ? 'rgba(96, 165, 250, 0.35)' : 'transparent',
        transition: 'background 120ms',
      }}
    />
  );
}
