import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Local browser tests (e2e/): the real pawos-web dev server in real Chromium, against a mock
 * Supabase. Not part of `npm test`. Run with `npm run test:e2e` (needs Playwright's Chromium).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
