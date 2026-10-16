import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The installed @supabase/supabase-js client at RUNTIME (not its type declarations), against a
 * local HTTP stub on 127.0.0.1 — what imageGeneration.ts relies on: what each call sends, how an
 * error comes back (a value or a throw), that an upload we stopped waiting for still completes
 * later, and that an RPC abort signal really cancels. The stub only answers; it does NOT prove what
 * a real Supabase Storage server does (that needs local Supabase or staging).
 */

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
const seen: Seen[] = [];
let respond: (req: Seen, res: http.ServerResponse) => void = (_req, res) => res.end("{}");
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const entry = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
      seen.push(entry);
      respond(entry, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

// Node 20 has no global WebSocket, and realtime-js refuses to construct without one (Node 22+ has
// it). Realtime is never used here, so an inert transport stands in; storage and REST are unaffected.
class NoRealtime {}
const client = () =>
  createClient(base, "test-service-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: NoRealtime as unknown as typeof WebSocket },
  });
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const bucket = () => client().storage.from("generated-images");

describe("Storage client (installed SDK, runtime)", () => {
  it("upload: one POST to the object path, no overwrite; an upload we stop waiting for still completes later", async () => {
    seen.length = 0;
    respond = (_req, res) => setTimeout(() => json(res, 200, { Key: "generated-images/u/g.png", Id: "x" }), 300);
    const upload = bucket().upload("u/g.png", new Uint8Array([1, 2, 3]), { contentType: "image/png", upsert: false });
    const raced = await Promise.race([upload.then(() => "upload"), new Promise((r) => setTimeout(() => r("timeout"), 50))]);
    expect(raced).toBe("timeout");
    const late = await upload; // the request was never cancelled
    expect(late.error).toBeNull();
    expect(late.data).toMatchObject({ path: "u/g.png" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", url: "/storage/v1/object/generated-images/u/g.png" });
    expect(seen[0]!.headers["x-upsert"]).toBe("false");
  });

  it("upload failure comes back as an error value, not a throw", async () => {
    respond = (_req, res) => json(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    const result = await bucket().upload("u/g.png", new Uint8Array([1]), { contentType: "image/png", upsert: false });
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("remove: one DELETE with the paths as prefixes; an empty answer is success; a failure is an error value", async () => {
    seen.length = 0;
    respond = (_req, res) => json(res, 200, []);
    const ok = await bucket().remove(["u/g.png", "u/g.jpg", "u/g.webp"]);
    expect(ok).toEqual({ data: [], error: null });
    expect(seen[0]).toMatchObject({ method: "DELETE", url: "/storage/v1/object/generated-images" });
    expect(JSON.parse(seen[0]!.body)).toEqual({ prefixes: ["u/g.png", "u/g.jpg", "u/g.webp"] });
    respond = (_req, res) => json(res, 500, { statusCode: "500", error: "internal", message: "down" });
    const failed = await bucket().remove(["u/g.png"]);
    expect(failed.data).toBeNull();
    expect(failed.error).toBeTruthy();
  });

  it("download: the bytes as a Blob; a missing object is an error value, not a throw", async () => {
    respond = (_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    };
    const found = await bucket().download("u/g.png");
    expect(found.error).toBeNull();
    expect(new Uint8Array(await found.data!.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    respond = (_req, res) => json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const missing = await bucket().download("u/missing.png");
    expect(missing.data).toBeNull();
    expect(missing.error).toBeTruthy();
  });

  it("info: a GET to the object's info path (not used by imageGeneration.ts; recorded for reference)", async () => {
    seen.length = 0;
    respond = (_req, res) => json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const info = await bucket().info("u/g.png");
    expect(info.data).toBeNull();
    expect(info.error).toBeTruthy();
    expect(seen[0]).toMatchObject({ method: "GET", url: "/storage/v1/object/info/generated-images/u/g.png" });
  });

  it("rpc: a POST to /rest/v1/rpc/<name>; an abort signal really cancels it and comes back as an error value", async () => {
    seen.length = 0;
    respond = (_req, res) => setTimeout(() => json(res, 200, { ok: true }), 500);
    const started = Date.now();
    const result = await client().rpc("complete_image_generation", { p_user_id: "u" }).abortSignal(AbortSignal.timeout(50));
    expect(Date.now() - started).toBeLessThan(400);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(seen.at(-1)).toMatchObject({ method: "POST", url: "/rest/v1/rpc/complete_image_generation" });
  });
});
