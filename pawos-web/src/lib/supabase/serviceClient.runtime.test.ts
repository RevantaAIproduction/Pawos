import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServiceClient } from "./serviceClient";

/**
 * Smoke test: the real createServiceClient() — the installed @supabase/supabase-js, no mocks, no
 * network (it only constructs the client). Every server route that talks to Supabase builds a
 * client the same way (createClient / @supabase/ssr), and @supabase/realtime-js refuses to
 * construct on a runtime without a native WebSocket (Node < 22) unless a transport is passed.
 *
 * This proves what THIS runtime does. It says nothing about the production server's Node version.
 */
const nativeWebSocket = typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "undefined";
const nodeMajor = Number(process.versions.node.split(".")[0]);

const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-service-key";
});
afterEach(() => {
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
});

describe(`createServiceClient() on Node ${process.versions.node} (native WebSocket: ${nativeWebSocket})`, () => {
  it.runIf(nativeWebSocket)("constructs, with the storage and database builders the server uses", () => {
    const client = createServiceClient();
    expect(typeof client.rpc).toBe("function");
    expect(typeof client.storage.from("generated-images").upload).toBe("function");
    expect(typeof client.rpc("get_generated_image", {}).abortSignal).toBe("function");
  });

  it.runIf(!nativeWebSocket)("cannot construct without a native WebSocket — the server needs Node 22+ (or a transport)", () => {
    expect(nodeMajor).toBeLessThan(22);
    expect(() => createServiceClient()).toThrow(/without native WebSocket support/);
  });
});
