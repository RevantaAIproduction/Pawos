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
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
