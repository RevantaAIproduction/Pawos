'use client';

import { useEffect } from 'react';

/**
 * Registers the Mobile Presence PWA's service worker (public/sw.js) once on
 * mount. Silently no-ops in browsers/contexts without Service Worker
 * support (e.g. this file is mounted site-wide in the root layout, not just
 * on /companion, so it must never throw on a plain desktop browser visit).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Real failure modes here are environmental (no HTTPS in local dev
      // without --experimental-https, browser has SW disabled, etc.) —
      // never fatal to the rest of the page.
    });
  }, []);

  return null;
}
