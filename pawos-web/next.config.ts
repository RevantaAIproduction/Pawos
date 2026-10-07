import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicit, since a sibling lockfile at the repo root (the separate
  // Electron app) otherwise makes Turbopack infer that as the workspace
  // root and resolve node_modules from the wrong place.
  turbopack: {
    root: path.join(__dirname),
  },
  // Mobile Presence PWA Foundation (MOB-4) — the service worker must never
  // be cached (a stale cached sw.js is a classic PWA bug: users get stuck
  // on an old service worker indefinitely since the browser only checks
  // for updates when it re-fetches this exact file).
  async headers() {
    return [
      // Baseline protections on every response. The Content-Security-Policy here is deliberately the
      // part that cannot break a page: who may frame PawOS, what <base> and plugins may do. It does
      // not restrict scripts, styles or connections, so Razorpay checkout, Supabase, sign-in
      // redirects and the pawos:// hand-off are unaffected. A script/connect policy needs its own
      // rollout (report-only first).
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          // Features the site never uses. `payment` is left alone for Razorpay's checkout frame.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
          // Browsers ignore this over plain HTTP (local development); production is HTTPS only.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/.well-known/microsoft-identity-association.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
