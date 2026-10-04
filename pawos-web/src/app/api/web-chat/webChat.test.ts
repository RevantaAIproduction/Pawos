import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../lib/account/accountContext";

/**
 * PawOS Web chat: who may send, how many, and what gets charged. The model is a fake `fetch`;
 * no real key and no network. `session` is the request's signed-in user (null = signed out).
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
import { WEB_CHAT_FREE_MESSAGE_LIMIT } from "../../../lib/webChat/webChat";

const HOST = "pawos.test";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://${HOST}/api/web-chat/messages`, { method: "POST", headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const chatsRequest = (chat?: string) => new Request(`https://${HOST}/api/web-chat/chats${chat ? `?chat=${chat}` : ""}`);

let modelCalls: Array<{ url: string; headers: Record<string, string>; body: { contents: { role: string; parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] }; generationConfig: { maxOutputTokens: number } } }>;
let modelStatus: number;
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      modelCalls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) });
      if (modelStatus !== 200) return new Response("{}", { status: modelStatus });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: `Reply ${modelCalls.length}` }] } }],
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, cachedContentTokenCount: 0, thoughtsTokenCount: 5 },
        }),
        { status: 200 }
      );
    })
  );
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sign-in is required", () => {
  it("rejects a signed-out caller before the model or the database is touched", async () => {
    state.session = null;
    expect((await send(post({ content: "hi" }))).status).toBe(401);
    expect((await getChats(chatsRequest())).status).toBe(401);
    expect(modelCalls).toHaveLength(0);
    expect(state.backend.tables.web_chat_messages).toHaveLength(0);
  });

  it("rejects a cross-site request", async () => {
    expect((await send(post({ content: "hi" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(modelCalls).toHaveLength(0);
  });
});

describe("Paw Go: exactly four messages", () => {
  it("allows four, counts down, then refuses the fifth without calling the model", async () => {
    expect(WEB_CHAT_FREE_MESSAGE_LIMIT).toBe(4);
    let chatId: string | undefined;
    const remaining: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await send(post({ chatId, content: `Question ${i + 1}` }));
      expect(response.status).toBe(200);
      const body = await response.json();
      chatId = body.chatId;
      remaining.push(body.allowance.remaining);
      expect(body.allowance.messageLimit).toBe(4);
    }
    expect(remaining).toEqual([3, 2, 1, 0]);

    const fifth = await send(post({ chatId, content: "One more" }));
    expect(fifth.status).toBe(402);
    expect(await fifth.json()).toMatchObject({ ok: false, code: "message_limit_reached" });
    expect(modelCalls).toHaveLength(4);
    expect(state.backend.tables.web_chat_messages.filter((m) => m.role === "user")).toHaveLength(4);
  });

  it("counts across chats, so starting a new chat does not reset the limit", async () => {
    for (let i = 0; i < 4; i++) await send(post({ content: `New chat ${i}` })); // four separate chats
    expect(state.backend.tables.web_chats).toHaveLength(4);
    expect((await send(post({ content: "A fifth chat" }))).status).toBe(402);
  });

  it("is not charged to a usage bucket", async () => {
    await send(post({ content: "hi" }));
    expect(state.backend.usageCalls).toHaveLength(0);
  });

  it("ignores a tier, limit or user id supplied in the request", async () => {
    for (let i = 0; i < 4; i++) await send(post({ content: `q${i}` }));
    const response = await send(post({ content: "again", tier: "enterprise", messageLimit: 9999, userId: "pro-user" }));
    expect(response.status).toBe(402);
  });

  it("the database refuses the fifth message even if the API's own pre-check were skipped", async () => {
    const service = state.backend.client(null, true);
    for (let i = 0; i < 4; i++) {
      await service.rpc("web_chat_append_exchange", { p_user_id: "go-user", p_chat_id: null, p_user_content: `q${i}`, p_assistant_content: "a", p_message_limit: 4 });
    }
    const fifth = await service.rpc("web_chat_append_exchange", { p_user_id: "go-user", p_chat_id: null, p_user_content: "q5", p_assistant_content: "a", p_message_limit: 4 });
    expect(fifth.error?.message).toBe("message_limit_reached");
    // …and a signed-in user cannot call the storing function themselves.
    const direct = await state.backend.client("go-user").rpc("web_chat_append_exchange", { p_user_id: "go-user", p_chat_id: null, p_user_content: "x", p_assistant_content: "y", p_message_limit: null });
    expect(direct.error).not.toBeNull();
  });

  it("a failed model call does not use up a message", async () => {
    modelStatus = 500;
    const failed = await send(post({ content: "hi" }));
    expect(failed.status).toBe(502);
    expect(state.backend.tables.web_chat_messages).toHaveLength(0);

    modelStatus = 200;
    expect((await (await send(post({ content: "hi" }))).json()).allowance.remaining).toBe(3);
  });
});

describe("paid tiers: the plan's usage allowance governs", () => {
  beforeEach(() => {
    state.session = proUser;
  });

  it("has no message cap, and reserves then settles each message against the usage buckets", async () => {
    let chatId: string | undefined;
    for (let i = 0; i < 6; i++) {
      const response = await send(post({ chatId, content: `Message ${i + 1}` }));
      expect(response.status).toBe(200);
      const body = await response.json();
      chatId = body.chatId;
      expect(body.allowance).toMatchObject({ messageLimit: null, remaining: null });
    }
    const names = state.backend.usageCalls.map((c) => c.name);
    expect(names.filter((n) => n === "reserve_usage")).toHaveLength(6);
    expect(names.filter((n) => n === "settle_usage")).toHaveLength(6);

    const reserve = state.backend.usageCalls[0].args;
    expect(reserve).toMatchObject({ p_model: "gemini-flash-latest", p_input_is_upper_bound: true, p_category: "web-chat", p_scope: "standard" });
    const settle = state.backend.usageCalls[1].args;
    expect(settle).toMatchObject({ p_reservation_id: "res-1", p_prompt_tokens: 120, p_candidates_tokens: 40, p_thoughts_tokens: 5 });
  });

  it.each([
    ["the plan allowance is used up", { ok: false, reason: "plan_exhausted" }],
    ["the weekly pace is reached", { ok: false, reason: "plan_weekly_paced" }],
    ["there is no allowance", { ok: false, reason: "no_allowance" }],
  ])("refuses, without calling the model, when %s", async (_label, reserveResult) => {
    state.backend.reserveResult = reserveResult;
    const response = await send(post({ content: "hi" }));

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ ok: false, code: "usage_limit_reached" });
    expect(modelCalls).toHaveLength(0);
    expect(state.backend.tables.web_chat_messages).toHaveLength(0);
  });

  it("releases the reservation when the model fails, so nothing is charged for no answer", async () => {
    modelStatus = 503;
    expect((await send(post({ content: "hi" }))).status).toBe(502);
    expect(state.backend.usageCalls.map((c) => c.name)).toEqual(["reserve_usage", "release_usage_reservation"]);
  });

  it("caps the reply length at what the reservation granted", async () => {
    state.backend.reserveResult = { ok: true, reservationId: "res-1", maxOutputTokens: 300 };
    await send(post({ content: "hi" }));
    expect(modelCalls[0].body.generationConfig.maxOutputTokens).toBe(300);
  });
});

describe("messages and chats", () => {
  it("sends the model key in a header (never the URL) and tells the model what the web can't do", async () => {
    await send(post({ content: "Fix the bug in my repo" }));
    const call = modelCalls[0];

    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect(call.url).not.toContain("test-model-key");
    expect(call.headers["x-goog-api-key"]).toBe("test-model-key");
    expect(call.body.systemInstruction.parts[0].text).toMatch(/cannot read the user's files, run commands/);
    expect(call.body.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "Fix the bug in my repo" }] });
  });

  it("continues a chat with its earlier messages, and lists the account's chats newest first", async () => {
    const first = await (await send(post({ content: "What is PawOS?" }))).json();
    await send(post({ chatId: first.chatId, content: "And on the web?" }));

    expect(modelCalls[1].body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    const listed = await (await getChats(chatsRequest(first.chatId))).json();
    expect(listed.chats).toEqual([expect.objectContaining({ id: first.chatId, title: "What is PawOS?" })]);
    expect(listed.messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ["user", "What is PawOS?"],
      ["assistant", "Reply 1"],
      ["user", "And on the web?"],
      ["assistant", "Reply 2"],
    ]);
    expect(listed.allowance).toEqual({ messageLimit: 4, period: "lifetime", messagesUsed: 2, remaining: 2 });
  });

  it("one account cannot read or continue another account's chat", async () => {
    const mine = await (await send(post({ content: "private" }))).json();
    state.session = proUser;

    expect((await getChats(chatsRequest(mine.chatId))).status).toBe(404);
    expect((await send(post({ chatId: mine.chatId, content: "intrude" }))).status).toBe(404);
    expect((await (await getChats(chatsRequest())).json()).chats).toEqual([]);
  });

  it.each([
    ["an empty message", { content: "   " }],
    ["a missing message", {}],
    ["a message that is too long", { content: "x".repeat(4001) }],
    ["a non-text message", { content: { text: "hi" } }],
  ])("rejects %s", async (_label, body) => {
    const response = await send(post(body));
    expect(response.status).toBe(400);
    expect(modelCalls).toHaveLength(0);
  });

  it("reports the chat as unavailable when the server has no model key", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await send(post({ content: "hi" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "not_configured" });
  });
});

describe("the limit is the one the migration enforces", () => {
  it("stores exchanges only through a service-role function that takes the limit and locks per account", () => {
    const migration = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "..", "supabase", "migrations", "20261004010000_web_chat.sql"), "utf8");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("raise exception 'message_limit_reached'");
    expect(migration).toMatch(/revoke all on function public\.web_chat_append_exchange\([^)]*\) from public, anon, authenticated;/);
    expect(migration).not.toMatch(/for (insert|update|delete)/i); // users can only read their own rows
  });
});
