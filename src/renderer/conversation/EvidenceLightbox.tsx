import React, { useEffect } from 'react';

/** Full-size view of one evidence image over the app — click outside, the close icon, or Esc to close. */
export function EvidenceLightbox({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={label}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0, 0, 0, 0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close"
        style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <img src={src} alt={label} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)' }} />
    </div>
  );
}
