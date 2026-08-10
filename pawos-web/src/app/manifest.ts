import type { MetadataRoute } from 'next';

/**
 * Mobile Presence — PWA Foundation (MOB-4). This is Phase 1's Mobile Client
 * per the architecture (Mobile Presence -> Mobile Client -> PWA); the
 * backend runtimes (Trusted Device/Pairing/Cross Device/Notification) are
 * client-agnostic, so a future native client could exist alongside this one
 * without any backend change.
 *
 * Icons reference the site's existing real logo asset with sizes: 'any'
 * rather than a fabricated "192x192"/"512x512" claim — logo-icon.png is a
 * real 480x430 PNG, not a purpose-cut square PWA icon set, so declaring
 * exact square dimensions here would be false. 'any' tells the browser to
 * use the image's real dimensions, the same honest pattern Next.js's own
 * manifest docs use for a non-standard favicon.ico.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PawOS',
    short_name: 'PawOS',
    description: 'Your AI companion, on your phone — notifications, approvals, and a live conversation preview.',
    start_url: '/companion',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      {
        src: '/logo-icon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
