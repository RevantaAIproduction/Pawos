import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicit, since a sibling lockfile at the repo root (the separate
  // Electron app) otherwise makes Turbopack infer that as the workspace
  // root and resolve node_modules from the wrong place.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
