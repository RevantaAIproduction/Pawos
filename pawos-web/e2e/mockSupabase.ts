import http from "node:http";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../src/lib/account/testing/fakeBackend";
import type { FakeGitHub } from "../src/lib/account/testing/fakeGitHub";

/**
 * LOCAL BROWSER TESTS ONLY. A tiny HTTP stand-in for Supabase (auth, PostgREST, Storage) and for
 * the model endpoint, backed by the same FakeBackend the unit tests use, so the real pawos-web dev
 * server can be driven in a real browser with no network and no real project.
 *
 * Sessions: the access token is a JWT-shaped string whose payload names the user; the mock
 * accepts it without a signature, which is exactly why this must never face a real network.
 */

type Row = Record<string, unknown>;

export const SERVICE_KEY = "e2e-service-role-key";
export const ANON_KEY = "e2e-anon-key";

export interface MockModel {
  calls: number;
  /** Milliseconds to hold each answer (to observe a send "in flight"). */
  delayMs: number;
}

const b64url = (value: string) => Buffer.from(value).toString("base64url");

export function accessTokenFor(userId: string): string {
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: userId, role: "authenticated", exp: 4102444800, aud: "authenticated" }))}.e2e`;
}

/** The cookie @supabase/ssr reads for a signed-in session against a Supabase URL on `localhost`. */
export function sessionCookie(user: User): { name: string; value: string } {
  const session = { access_token: accessTokenFor(user.id), refresh_token: `refresh-${user.id}`, token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
  return { name: "sb-localhost-auth-token", value: `base64-${b64url(JSON.stringify(session))}` };
}

function userIdFrom(authorization: string | undefined): { userId: string | null; service: boolean } {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (token === SERVICE_KEY) return { userId: null, service: true };
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string };
    return { userId: payload.sub ?? null, service: false };
  } catch {
    return { userId: null, service: false };
  }
}

function project(row: Row, select: string | null): Row {
  if (!select || select.trim() === "*") return row;
  const out: Row = {};
  let depth = 0;
  let current = "";
  const names: string[] = [];
  for (const char of select) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      names.push(current);
      current = "";
    } else current += char;
  }
  names.push(current);
  for (const item of names) {
    const name = item.split("(")[0].trim();
    if (name) out[name] = row[name];
  }
  return out;
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell ?? "") !== value) return false;
    if (op === "is" && value === "null" && cell !== null && cell !== undefined) return false;
    if (op === "gte" && !(String(cell ?? "") >= value)) return false;
  }
  return true;
}

function reply(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function modelReply(prompt: string, system: string): string {
  // Change code mode: the planner picks files; the editor returns the change.
  if (system.includes("choosing which files")) return JSON.stringify({ files: ["src/components/Header.tsx"], decline: null });
  if (system.includes("making a code change")) {
    return JSON.stringify({
      title: "Make the header sticky",
      summary: "The header now stays at the top while scrolling.",
      changes: [{ path: "src/components/Header.tsx", content: 'export function Header() {\n  return <header className="sticky top-0">Shop</header>;\n}\n' }],
      decline: null,
    });
  }
  if (/tests?|terminal|my repo/i.test(prompt)) return "Running your tests needs PawOS Desktop — PawOS Web can't run commands. Here's how to do it there.\n[[requires-desktop]]";
  if (/code/i.test(prompt)) {
    const long = `const result = [${Array.from({ length: 40 }, (_, i) => `"value-${i}"`).join(", ")}].map((item) => item.toUpperCase()).filter(Boolean);`;
    return `Here is a long line of code:\n\n\`\`\`ts\n${long}\nconsole.log(result);\n\`\`\`\n\n${"This explanation is long. ".repeat(60)}`;
  }
  return `Reply to: ${prompt.slice(0, 80)}`;
}

/** Accounts whose sessions were ended elsewhere (a global sign-out in PawOS Desktop). */
export const revokedUsers = new Set<string>();

export function startMockSupabase(backend: FakeBackend, model: MockModel, port: number, github?: FakeGitHub): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    // The browser's own Supabase client only signs out; allow it.
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-supabase-api-version");
    res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, HEAD, OPTIONS");
    if (req.method === "OPTIONS") return reply(res, 204, undefined);

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const { userId, service } = userIdFrom(req.headers.authorization);
    const body = await readBody(req);

    try {
      // ── Model stub ──
      if (url.pathname.startsWith("/v1beta/models/")) {
        model.calls += 1;
        const request = JSON.parse(body.toString("utf8")) as { contents: { parts: { text?: string }[] }[]; systemInstruction?: { parts: { text: string }[] } };
        const prompt = request.contents.at(-1)?.parts.map((part) => part.text ?? "").join(" ") ?? "";
        const system = request.systemInstruction?.parts[0]?.text ?? "";
        if (model.delayMs > 0 || /slow/i.test(prompt)) await new Promise((resolve) => setTimeout(resolve, Math.max(model.delayMs, /slow/i.test(prompt) ? 4000 : 0)));
        return reply(res, 200, { candidates: [{ content: { parts: [{ text: modelReply(prompt, system) }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } });
      }

      // ── GitHub stub ──
      if (github && url.pathname.startsWith("/github-api/")) {
        const result = github.handle(req.method ?? "GET", `https://api.github.com${url.pathname.slice("/github-api".length)}${url.search}`, req.headers.authorization ?? null, body.length ? JSON.parse(body.toString("utf8")) : undefined);
        return reply(res, result.status, result.json);
      }

      // ── Auth ──
      if (url.pathname === "/auth/v1/user") {
        const user = userId ? backend.users.get(userId) : undefined;
        if (userId && revokedUsers.has(userId)) return reply(res, 403, { code: "session_not_found", error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" });
        if (!userId || !user) return reply(res, 401, { message: "invalid token" });
        return reply(res, 200, { id: userId, aud: "authenticated", role: "authenticated", email: user.email ?? `${userId}@example.com`, user_metadata: user.meta ?? {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
      }
      if (url.pathname === "/auth/v1/logout") return reply(res, 204, undefined);

      // ── Storage ──
      const storage = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/);
      if (storage) {
        const bucket = backend.client(userId, service).storage.from(storage[1]);
        if (req.method === "POST" && storage[2]) {
          const result = await bucket.upload(storage[2], new Uint8Array(body), { contentType: String(req.headers["content-type"] ?? "") });
          return result.error ? reply(res, 400, { message: result.error.message }) : reply(res, 200, { Key: `${storage[1]}/${storage[2]}` });
        }
        if (req.method === "GET" && storage[2]) {
          const result = await bucket.download(storage[2]);
          if (result.error || !result.data) return reply(res, 404, { message: "Object not found" });
          res.writeHead(200, { "content-type": result.data.type });
          return res.end(Buffer.from(await result.data.arrayBuffer()));
        }
        if (req.method === "DELETE") {
          await bucket.remove((JSON.parse(body.toString("utf8") || "{}") as { prefixes?: string[] }).prefixes ?? []);
          return reply(res, 200, []);
        }
      }

      // ── RPC ──
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (rpc) {
        const args = body.length ? (JSON.parse(body.toString("utf8")) as Row) : {};
        const result = backend.rpc(userId, rpc[1], args, service);
        return result.error ? reply(res, 400, { message: result.error.message, code: "P0001" }) : reply(res, 200, result.data);
      }

      // ── Tables ──
      const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
      if (table) {
        const client = backend.client(userId, service);
        if (req.method === "GET" || req.method === "HEAD") {
          let rows = (backend.tables[table] ?? []).filter((row) => (service || (userId !== null && row.user_id === userId)) && matches(row, url.searchParams));
          const order = url.searchParams.get("order");
          if (order) {
            const [column, direction] = order.split(".");
            rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (direction === "desc" ? -1 : 1));
          }
          const limit = Number(url.searchParams.get("limit") ?? "0");
          const total = rows.length;
          if (limit > 0) rows = rows.slice(0, limit);
          const headers = { "content-range": `0-${Math.max(0, rows.length - 1)}/${total}` };
          if (req.method === "HEAD") return reply(res, 200, undefined, headers);
          return reply(res, 200, rows.map((row) => project(row, url.searchParams.get("select"))), headers);
        }
        if (req.method === "POST") {
          const rows = JSON.parse(body.toString("utf8")) as Row | Row[];
          for (const row of Array.isArray(rows) ? rows : [rows]) {
            const result = await client.from(table).insert(row);
            if (result.error) return reply(res, 403, { message: result.error.message, code: "42501" });
          }
          return reply(res, 201, undefined);
        }
        if (req.method === "PATCH") {
          const patch = JSON.parse(body.toString("utf8") || "{}") as Row;
          const id = url.searchParams.get("id")?.replace(/^eq\./, "");
          if (!id) return reply(res, 400, { message: "mock: PATCH needs an id filter" });
          const result = await client.from(table).update(patch).eq("id", id);
          return result.error ? reply(res, 403, { message: result.error.message }) : reply(res, 204, undefined);
        }
        if (req.method === "DELETE") {
          let query = client.from(table).delete();
          for (const [key, raw] of url.searchParams) {
            const [op, ...rest] = raw.split(".");
            if (op === "eq") query = query.eq(key, rest.join("."));
            if (op === "is") query = query.is(key, null);
          }
          const result = await query;
          return result.error ? reply(res, 403, { message: result.error.message }) : reply(res, 204, undefined);
        }
      }
      return reply(res, 404, { message: `mock: no route for ${req.method} ${url.pathname}` });
    } catch (error) {
      return reply(res, 500, { message: error instanceof Error ? error.message : "mock failure" });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
