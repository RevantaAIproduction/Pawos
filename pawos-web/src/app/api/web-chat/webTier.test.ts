import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../lib/account/accountContext";

/**
 * The PawOS Web tier architecture, through the real API routes: request claims and recovery on an
 * unreliable connection, the Paw Go limit under parallel and direct-write attack, paid usage on the
 * shared allowance, photo uploads, Continue in PawOS Desktop, and the security boundaries.
 * The model is a fake `fetch`; storage and the database are the in-memory FakeBackend (whose Web
 * chat functions model the SQL that supabase/tests/web_tier/run_local.sh runs on real PostgreSQL).
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null }));

vi.mock("../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("../../../lib/supabase/serviceClient", () => ({ createServiceClient: () => state.backend.client(null, true) }));

import { POST as send } from "./messages/route";
import { GET as getChats } from "./chats/route";
import { POST as upload } from "./uploads/route";
import { GET as readUploadRoute } from "./uploads/[id]/route";
import { GET as getHandoff } from "../web/handoff/route";
import { GET as listIntegrationsRoute } from "../dashboard/integrations/route";
import { extractDesktopMarker, REQUIRES_DESKTOP_MARKER } from "../../../lib/webChat/webChat";
import { sniffImageType } from "../../../lib/webChat/uploads";
import { buildTranscript, DESKTOP_NEW_CHAT_URL } from "../../../lib/webPolicy/desktopHandoff";
import { WEB_POLICY } from "../../../lib/webPolicy/webCapabilities";

const HOST = "pawos.test";
const SRC = path.join(__dirname, "..", "..", "..");
const REPO = path.join(SRC, "..", "..");
const post = (body: unknown) =>
  new Request(`https://${HOST}/api/web-chat/messages`, { method: "POST", headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const chatsRequest = (chat?: string) => new Request(`https://${HOST}/api/web-chat/chats${chat ? `?chat=${chat}` : ""}`);
const handoffRequest = (chat: string) => new Request(`https://${HOST}/api/web/handoff?chat=${chat}`);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
function uploadRequest(bytes: Uint8Array, uploadId: string, name = "photo.png", origin = `https://${HOST}`) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type: "image/png" }));
  form.append("uploadId", uploadId);
  return new Request(`https://${HOST}/api/web-chat/uploads`, { method: "POST", headers: { host: HOST, origin }, body: form });
}
const uploadParams = (id: string) => ({ params: Promise.resolve({ id }) });

interface ModelCall {
  body: { contents: { role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }[] };
}
let modelCalls: ModelCall[];
let modelStatus: number;
let modelText: (n: number) => string;
/** When set, the model holds every answer until the gate opens — a send "in flight". */
let modelGate: Promise<void> | null;
let goUser: User;
let proUser: User;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-model-key";
  state.backend = new FakeBackend();
  goUser = state.backend.addUser("go-user");
  proUser = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
  state.session = goUser;
  modelCalls = [];
  modelStatus = 200;
  modelText = (n) => `Reply ${n}`;
  modelGate = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      modelCalls.push({ body: JSON.parse(String(init?.body)) });
      const n = modelCalls.length;
      if (modelGate) await modelGate;
      if (modelStatus !== 200) return new Response("{}", { status: modelStatus });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: modelText(n) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }), { status: 200 });
    })
  );
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const userMessages = (uid: string) => state.backend.tables.web_chat_messages.filter((m) => m.user_id === uid && m.role === "user");

describe("sign-in is required for every new Web endpoint", () => {
  it("rejects signed-out uploads, photo reads and hand-offs with 401", async () => {
    state.session = null;
    expect((await upload(uploadRequest(PNG, "upload-0001"))).status).toBe(401);
    expect((await readUploadRoute(new Request(`https://${HOST}/x`), uploadParams("00000000-0000-4000-8000-000000000001"))).status).toBe(401);
    expect((await getHandoff(handoffRequest("00000000-0000-4000-8000-000000000001"))).status).toBe(401);
    expect(state.backend.storage.size).toBe(0);
  });

  it("rejects a cross-site upload", async () => {
    state.session = proUser;
    expect((await upload(uploadRequest(PNG, "upload-0001", "photo.png", "https://evil.example"))).status).toBe(403);
  });
});

describe("Paw Go: exactly four lifetime Web messages, whatever the client does", () => {
  it("parallel sends can never produce a fifth message — and the refused ones never reach the model", async () => {
    const responses = await Promise.all(Array.from({ length: 7 }, (_, i) => send(post({ content: `parallel ${i}`, requestId: `parallel-req-${i}` }))));
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 402, 402, 402]);
    expect(userMessages("go-user")).toHaveLength(4);
    expect(modelCalls).toHaveLength(4);
  });

  it("a failed model call releases its message, and the same request id can be retried", async () => {
    modelStatus = 500;
    expect((await send(post({ content: "hi", requestId: "retry-req-01" }))).status).toBe(502);
    expect(state.backend.tables.web_chat_requests[0]).toMatchObject({ state: "failed" });
    modelStatus = 200;
    const retry = await (await send(post({ content: "hi", requestId: "retry-req-01" }))).json();
    expect(retry).toMatchObject({ ok: true, recovered: false, allowance: { messagesUsed: 1, remaining: 3 } });
  });

  it("writing to the tables directly cannot add a message or reset the count", async () => {
    for (let i = 0; i < 4; i++) await send(post({ content: `q${i}` }));
    const service = state.backend.client(null, true);
    const chatId = String(state.backend.tables.web_chats[0].id);
    expect((await service.from("web_chat_messages").insert({ chat_id: chatId, user_id: "go-user", role: "user", content: "sneaky" })).error).not.toBeNull();
    expect((await service.from("web_chat_usage").delete().eq("user_id", "go-user")).error).not.toBeNull();
    expect((await state.backend.client("go-user").from("web_chats").insert({ user_id: "go-user", title: "mine" })).error).not.toBeNull();
    // Deleting every chat (and so every message) still leaves the lifetime count at four.
    await service.from("web_chats").delete().eq("user_id", "go-user");
    state.backend.tables.web_chat_messages = [];
    const fifth = await send(post({ content: "after deleting everything" }));
    expect(fifth.status).toBe(402);
    expect(modelCalls).toHaveLength(4);
  });

  it("starting new chats does not reset the limit, and the request body cannot raise it", async () => {
    for (let i = 0; i < 4; i++) await send(post({ content: `chat ${i}` }));
    const response = await send(post({ content: "more", tier: "enterprise", messageLimit: 100, capabilities: { "web.chat": "available" } }));
    expect(response.status).toBe(402);
    expect(state.backend.tables.web_chats).toHaveLength(4);
  });
});

describe("unreliable connections: the server is the source of truth", () => {
  it("a retry while the first attempt is still running is told 'processing' and never calls the model twice", async () => {
    let open!: () => void;
    modelGate = new Promise((resolve) => (open = resolve));
    const first = send(post({ content: "slow question", requestId: "inflight-req-1" }));
    await vi.waitFor(() => expect(modelCalls).toHaveLength(1));

    const retry = await send(post({ content: "slow question", requestId: "inflight-req-1" }));
    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({ ok: false, code: "processing" });
    const recover = await send(post({ requestId: "inflight-req-1", recoverOnly: true }));
    expect(recover.status).toBe(202);

    open();
    expect((await first).status).toBe(200);
    const recovered = await (await send(post({ requestId: "inflight-req-1", recoverOnly: true }))).json();
    expect(recovered).toMatchObject({ ok: true, recovered: true, reply: "Reply 1" });
    expect(modelCalls).toHaveLength(1);
    expect(userMessages("go-user")).toHaveLength(1);
  });

  it("a reply whose response was lost can be fetched afterwards, and the conversation reloads from the server", async () => {
    // The browser never sees this response (a phone switching networks).
    await send(post({ content: "lost answer", requestId: "lost-req-001" }));

    const recovered = await (await send(post({ requestId: "lost-req-001", recoverOnly: true }))).json();
    expect(recovered).toMatchObject({ ok: true, recovered: true, reply: "Reply 1" });
    const reloaded = await (await getChats(chatsRequest(recovered.chatId))).json();
    expect(reloaded.messages.map((m: { content: string }) => m.content)).toEqual(["lost answer", "Reply 1"]);
  });

  it("re-sending the same request id stores nothing twice and charges once", async () => {
    state.session = proUser;
    const a = await (await send(post({ content: "once", requestId: "dup-req-0001" }))).json();
    const b = await (await send(post({ content: "once", requestId: "dup-req-0001" }))).json();
    expect(b).toMatchObject({ ok: true, recovered: true, chatId: a.chatId, reply: a.reply });
    expect(userMessages("pro-user")).toHaveLength(1);
    expect(state.backend.usageCalls.map((c) => c.name)).toEqual(["reserve_usage", "settle_usage"]);
  });

  it("asking about a send the server never received says so (404) and stores nothing", async () => {
    const response = await send(post({ requestId: "never-sent-01", recoverOnly: true }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found" });
    expect(modelCalls).toHaveLength(0);
  });

  it("a claim abandoned by a crashed server can be taken over after its lease", async () => {
    let open!: () => void;
    modelGate = new Promise((resolve) => (open = resolve));
    void send(post({ content: "crashy", requestId: "crash-req-01" }));
    await vi.waitFor(() => expect(modelCalls).toHaveLength(1));
    state.backend.tables.web_chat_requests[0].lease_expires_at = new Date(Date.now() - 1000).toISOString();
    modelGate = null;
    const takeover = await send(post({ content: "crashy", requestId: "crash-req-01" }));
    expect(takeover.status).toBe(200);
    open();
    await vi.waitFor(() => expect(state.backend.tables.web_chat_requests[0].state).toBe("completed"));
    // The original attempt finishing late stores nothing extra.
    expect(userMessages("go-user")).toHaveLength(1);
  });
});

describe("paid tiers share the account's one usage allowance with the desktop app", () => {
  beforeEach(() => {
    state.session = proUser;
  });

  it("Web and Desktop draw on the same allowance: Desktop use can exhaust it for Web", async () => {
    state.backend.usagePool = 3;
    const desktop = state.backend.client("pro-user"); // the desktop app calls reserve_usage as the signed-in user, too
    await desktop.rpc("reserve_usage", { p_request_key: "desktop-1", p_category: "chat" });
    await desktop.rpc("reserve_usage", { p_request_key: "desktop-2", p_category: "chat" });

    expect((await send(post({ content: "web one" }))).status).toBe(200);
    const refused = await send(post({ content: "web two" }));
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({ code: "usage_limit_reached" });
    expect(modelCalls).toHaveLength(1);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage").map((c) => c.args.p_category)).toEqual(["chat", "chat", "web-chat", "web-chat"]);
  });

  it("uses the desktop app's own reservation functions and arguments — no Web-only path", () => {
    const desktop = fs.readFileSync(path.join(REPO, "src", "main", "billing", "UsageBucketClient.ts"), "utf8");
    const web = fs.readFileSync(path.join(SRC, "lib", "webChat", "webChat.ts"), "utf8");
    for (const fn of ["reserve_usage", "settle_usage", "release_usage_reservation"]) {
      expect(desktop).toContain(`'${fn}'`);
      expect(web).toContain(`"${fn}"`);
    }
    for (const arg of ["p_request_key", "p_model", "p_input_tokens", "p_input_is_upper_bound", "p_max_output_tokens", "p_category", "p_scope"]) {
      expect(desktop).toContain(arg);
      expect(web).toContain(arg);
    }
  });

  it("a failed model call releases the reservation and the claim (the desktop's release semantics)", async () => {
    state.backend.usagePool = 1;
    modelStatus = 503;
    expect((await send(post({ content: "fails", requestId: "paid-fail-01" }))).status).toBe(502);
    expect(state.backend.usagePool).toBe(1);
    expect(state.backend.tables.web_chat_requests[0].state).toBe("failed");
  });

  it("a plan change takes effect on the next request", async () => {
    state.session = goUser;
    for (let i = 0; i < 4; i++) await send(post({ content: `go ${i}` }));
    expect((await send(post({ content: "blocked" }))).status).toBe(402);

    state.backend.users.set("go-user", { subscription: { active: true, tier: "pro" } }); // upgraded
    expect((await send(post({ content: "now paid" }))).status).toBe(200);
    expect(state.backend.usageCalls.some((c) => c.name === "reserve_usage")).toBe(true);

    state.backend.users.set("go-user", { subscription: { active: false, tier: "pro" } }); // lapsed back to Go
    expect((await send(post({ content: "lapsed" }))).status).toBe(402);
  });
});

describe("Desktop-only requests are answered honestly", () => {
  it("a reply marked as needing PawOS Desktop is flagged, stored without the marker, and offers the hand-off", async () => {
    modelText = () => `Running your tests needs PawOS Desktop. Here is the plan instead.\n${REQUIRES_DESKTOP_MARKER}`;
    const sent = await (await send(post({ content: "run my tests" }))).json();
    expect(sent).toMatchObject({ ok: true, requiresDesktop: true, reply: "Running your tests needs PawOS Desktop. Here is the plan instead." });
    const reloaded = await (await getChats(chatsRequest(sent.chatId))).json();
    expect(reloaded.messages[1]).toMatchObject({ requiresDesktop: true, surface: "web" });
    expect(reloaded.messages[1].content).not.toContain(REQUIRES_DESKTOP_MARKER);
  });

  it("ordinary replies are not flagged", () => {
    expect(extractDesktopMarker("Here is an explanation.")).toEqual({ text: "Here is an explanation.", requiresDesktop: false });
  });
});

describe("photo uploads", () => {
  beforeEach(() => {
    state.session = proUser;
  });

  it("stores a photo privately, retries idempotently, and sends it to the model with the message", async () => {
    const first = await (await upload(uploadRequest(PNG, "upload-0001"))).json();
    expect(first).toMatchObject({ ok: true, attachment: { kind: "image", mimeType: "image/png", name: "photo.png" } });
    const again = await (await upload(uploadRequest(PNG, "upload-0001"))).json();
    expect(again.attachment.id).toBe(first.attachment.id);
    expect(state.backend.storage.size).toBe(1);
    expect([...state.backend.storage.keys()][0]).toBe(`web-chat-uploads/pro-user/${first.attachment.id}`);

    const sent = await (await send(post({ content: "What's in this photo?", imageId: first.attachment.id }))).json();
    expect(sent.ok).toBe(true);
    const parts = modelCalls[0].body.contents.at(-1)?.parts ?? [];
    expect(parts[0].inlineData).toEqual({ mimeType: "image/png", data: Buffer.from(PNG).toString("base64") });

    const reloaded = await (await getChats(chatsRequest(sent.chatId))).json();
    expect(reloaded.messages[0].attachments).toEqual([expect.objectContaining({ id: first.attachment.id, name: "photo.png" })]);
    const image = await readUploadRoute(new Request(`https://${HOST}/x`), uploadParams(first.attachment.id));
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("cache-control")).toContain("private");

    // A photo belongs to one message.
    expect((await send(post({ content: "again", imageId: first.attachment.id }))).status).toBe(400);
  });

  it("decides the type from the bytes and enforces the size and daily limits", async () => {
    const text = new TextEncoder().encode("<script>alert(1)</script>");
    expect((await upload(uploadRequest(text, "upload-0002", "evil.png"))).status).toBe(415);
    const big = new Uint8Array(WEB_POLICY.maxImageBytes + 1);
    big.set(JPEG);
    expect((await upload(uploadRequest(big, "upload-0003"))).status).toBe(413);
    for (let i = 0; i < WEB_POLICY.maxImageUploadsPerDay; i++) state.backend.tables.web_chat_attachments.push({ id: `a${i}`, user_id: "pro-user", created_at: new Date().toISOString() });
    expect((await upload(uploadRequest(PNG, "upload-0004"))).status).toBe(429);
    expect(state.backend.storage.size).toBe(0);
  });

  it("recognises the photo formats phones produce", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0"))).toBe("image/heic");
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("Paw Go cannot upload or attach a photo, even by calling the API directly", async () => {
    const proPhoto = await (await upload(uploadRequest(PNG, "upload-0005"))).json();
    state.session = goUser;
    expect((await upload(uploadRequest(PNG, "upload-0006"))).status).toBe(403);
    expect((await send(post({ content: "look", imageId: proPhoto.attachment.id }))).status).toBe(403);
    expect(modelCalls).toHaveLength(0);
  });

  it("one account can never read or attach another account's photo", async () => {
    const mine = await (await upload(uploadRequest(PNG, "upload-0007"))).json();
    state.backend.addUser("other-pro", { subscription: { active: true, tier: "proMax" } });
    state.session = { id: "other-pro", email: "o@example.com", user_metadata: {} } as unknown as User;
    expect((await readUploadRoute(new Request(`https://${HOST}/x`), uploadParams(mine.attachment.id))).status).toBe(404);
    expect((await send(post({ content: "steal", imageId: mine.attachment.id }))).status).toBe(400);
    expect(modelCalls).toHaveLength(0);
  });
});

describe("Continue in PawOS Desktop", () => {
  it("hands over the stored conversation by its server id, with no secret in the link", async () => {
    const sent = await (await send(post({ content: "Plan the refactor" }))).json();
    const response = await getHandoff(handoffRequest(sent.chatId));
    expect(response.status).toBe(200);
    const { handoff } = await response.json();
    expect(handoff).toMatchObject({ chatId: sent.chatId, desktopUrl: DESKTOP_NEW_CHAT_URL, truncated: false });
    expect(handoff.desktopUrl).toBe("pawos://jump/new-chat");
    expect(handoff.transcript).toContain("Plan the refactor");
    expect(handoff.transcript).toContain("Reply 1");
  });

  it("refuses another account's chat", async () => {
    const sent = await (await send(post({ content: "private plan" }))).json();
    state.session = proUser;
    expect((await getHandoff(handoffRequest(sent.chatId))).status).toBe(404);
  });

  it("keeps the most recent messages when the conversation is long", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `message ${i} ${"x".repeat(400)}`, createdAt: "" }));
    const { transcript, truncated } = buildTranscript("Long", messages, 3000);
    expect(truncated).toBe(true);
    expect(transcript.length).toBeLessThanOrEqual(3000);
    expect(transcript).toContain("message 49");
    expect(transcript).not.toContain("message 0 ");
  });
});

describe("no credential ever reaches the browser", () => {
  it("connection state is returned without any stored token", async () => {
    state.session = proUser;
    state.backend.addConnection("pro-user", "github", "connected", { username: "octo" });
    Object.assign(state.backend.tables.connectivity_credentials[0], { secret: "gho_super_secret_token", refresh_token: "ghr_refresh_secret" });
    const body = JSON.stringify(await (await listIntegrationsRoute()).json());
    expect(body).toContain("connected");
    expect(body).not.toMatch(/gho_super_secret_token|ghr_refresh_secret|access_token|refresh_token|client_secret/);
  });

  it("chat, upload and hand-off responses carry no token, key or storage path", async () => {
    state.session = proUser;
    const photo = await upload(uploadRequest(PNG, "upload-0008"));
    const photoBody = await photo.text();
    const sent = await send(post({ content: "hello", imageId: JSON.parse(photoBody).attachment.id }));
    const sentBody = await sent.text();
    const handoff = await (await getHandoff(handoffRequest(JSON.parse(sentBody).chatId))).text();
    for (const body of [photoBody, sentBody, handoff]) {
      expect(body).not.toMatch(/test-model-key|service_role|storage_path|pro-user\/|access_token|refresh_token/);
    }
  });
});

describe("architecture boundaries", () => {
  it("the migration guards direct writes and keeps the limit monotonic", () => {
    const migration = fs.readFileSync(path.join(REPO, "supabase", "migrations", "20261004020000_web_tier_architecture.sql"), "utf8");
    expect(migration).toContain("web_chat_direct_write_forbidden");
    expect(migration).toContain("web_chat_usage_monotonic");
    expect(migration).toMatch(/create or replace function public\.web_chat_begin_request/);
    expect(migration).toMatch(/revoke all on function public\.web_chat_begin_request\([^)]*\) from public, anon, authenticated;/);
    expect(migration).toMatch(/revoke all on function public\.web_chat_append_exchange\([^)]*\) from public, anon, authenticated;/);
    expect(migration).toMatch(/'web-chat-uploads', 'web-chat-uploads', false/);
    // No usage table or function of the desktop's is touched (comments aside).
    const statements = migration.replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(/usage_buckets|reserve_usage|settle_usage|usage_bucket_events/);
  });

  it("the Go limit is defined in one place", () => {
    const files = ["lib/webChat/webChat.ts", "lib/webChat/uploads.ts", "components/workspace/WorkspaceChat.tsx", "app/app/page.tsx", "app/dashboard/page.tsx"];
    for (const file of files) expect(fs.readFileSync(path.join(SRC, file), "utf8")).not.toMatch(/\b(limit|Limit|messages?)\b[^\n]{0,20}\b4\b/);
    expect(WEB_POLICY.goLifetimeWebMessages).toBe(4);
  });
});

describe("one chat history across Desktop, Web and mobile", () => {
  const DESKTOP_CHAT = "00000000-0000-4000-8000-0000000000dd";
  function seedDesktopChat(userId: string, turns: number) {
    state.backend.tables.web_chats.push({ id: DESKTOP_CHAT, user_id: userId, title: "Fix the login bug", surface: "desktop", desktop_session_id: "session-1", updated_at: "2026-10-03T09:00:00Z" });
    for (let i = 0; i < turns; i++) {
      state.backend.tables.web_chat_messages.push(
        { id: `d-${i}-u`, chat_id: DESKTOP_CHAT, user_id: userId, role: "user", content: `desktop question ${i}`, request_id: `desktop-turn-${i}`, surface: "desktop", created_at: `2026-10-03T08:0${i}:00Z` },
        { id: `d-${i}-a`, chat_id: DESKTOP_CHAT, user_id: userId, role: "assistant", content: `desktop answer ${i}`, request_id: `desktop-turn-${i}`, surface: "desktop", created_at: `2026-10-03T08:0${i}:01Z` }
      );
    }
  }

  it("lists Desktop chats with Web chats, labelled, and opens them with each message's surface", async () => {
    seedDesktopChat("go-user", 2);
    const listed = await (await getChats(chatsRequest(DESKTOP_CHAT))).json();
    expect(listed.chats).toEqual([expect.objectContaining({ id: DESKTOP_CHAT, surface: "desktop", title: "Fix the login bug" })]);
    expect(listed.messages.map((m: { surface: string }) => m.surface)).toEqual(["desktop", "desktop", "desktop", "desktop"]);
  });

  it("Desktop turns never use Paw Go's Web messages", async () => {
    seedDesktopChat("go-user", 6);
    const allowance = (await (await getChats(chatsRequest())).json()).allowance;
    expect(allowance).toMatchObject({ messageLimit: 4, messagesUsed: 0, remaining: 4 });
    expect((await send(post({ content: "hello from the web" }))).status).toBe(200);
  });

  it("continuing a Desktop chat on the web keeps it one chat; the new messages are labelled web", async () => {
    seedDesktopChat("pro-user", 1);
    state.session = proUser;
    const sent = await (await send(post({ chatId: DESKTOP_CHAT, content: "Explain what you changed" }))).json();
    expect(sent.chatId).toBe(DESKTOP_CHAT);
    const reloaded = await (await getChats(chatsRequest(DESKTOP_CHAT))).json();
    expect(reloaded.messages.map((m: { surface: string }) => m.surface)).toEqual(["desktop", "desktop", "web", "web"]);
    // The model sees the Desktop part of the conversation too.
    expect(modelCalls[0].body.contents.map((c) => c.parts[0].text)).toEqual(["desktop question 0", "desktop answer 0", "Explain what you changed"]);
  });

  it("another account's Desktop chat is invisible", async () => {
    seedDesktopChat("pro-user", 1);
    expect((await getChats(chatsRequest(DESKTOP_CHAT))).status).toBe(404);
    expect((await send(post({ chatId: DESKTOP_CHAT, content: "intrude" }))).status).toBe(404);
  });

  it("the Desktop app syncs through the shared account store, in the same order as Web reads it", () => {
    const desktopSync = fs.readFileSync(path.join(REPO, "src", "main", "conversation", "AccountChatSync.ts"), "utf8");
    for (const fn of ["account_chat_sync_desktop_turn", "get_my_account_chats", "get_my_account_chat", "account_chat_rename", "account_chat_delete"]) expect(desktopSync).toContain(`'${fn}'`);
    const migration = fs.readFileSync(path.join(REPO, "supabase", "migrations", "20261004050000_account_chats.sql"), "utf8");
    expect(migration).toMatch(/role = 'user' and surface = 'web'/);
  });
});
