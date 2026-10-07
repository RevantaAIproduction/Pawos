import { describe, expect, it } from "vitest";
import { AuthRequiredError } from "../auth/authManager";
import type { FetchLike } from "../auth/supabaseAuth";
import { PawosApiError, PawosClient } from "./pawosClient";

/** The extension's calls to the existing PawOS Web API. */
const BASE = "https://pawos.test";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function setup(respond: (call: Call, index: number) => Response | Promise<Response>, tokens: { current?: string; refreshed?: string | Error } = {}) {
  const calls: Call[] = [];
  const tokenRequests: boolean[] = [];
  let rejected = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = { method: init?.method ?? "GET", url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  const client = new PawosClient(
    () => BASE,
    async (forceRefresh = false) => {
      tokenRequests.push(forceRefresh);
      if (!forceRefresh) return tokens.current ?? "token-1";
      if (tokens.refreshed instanceof Error) throw tokens.refreshed;
      return tokens.refreshed ?? "token-2";
    },
    async () => {
      rejected += 1;
    },
    fetchImpl
  );
  return { client, calls, tokenRequests, rejectedCount: () => rejected };
}

const CAPABILITIES = {
  ok: true,
  plan: { tier: "pro", label: "Paw Pro" },
  capabilities: [{ id: "web.codeChanges", label: "Code changes", status: "available", availableOn: null }],
  limits: { webMessageLimit: null },
};

describe("GET /api/web/capabilities", () => {
  it("is called with the access token as a Bearer header, and nowhere else", async () => {
    const { client, calls } = setup(() => json(200, CAPABILITIES));
    const result = await client.getCapabilities();
    expect(result.plan).toEqual({ tier: "pro", label: "Paw Pro" });
    expect(result.capabilities[0]).toMatchObject({ id: "web.codeChanges", status: "available" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://pawos.test/api/web/capabilities", body: undefined });
    expect(calls[0]!.headers.Authorization).toBe("Bearer token-1");
    expect(calls[0]!.url).not.toContain("token-1");
  });
});

describe("401 authentication failure", () => {
  it("refreshes the token once and repeats the request", async () => {
    const { client, calls, tokenRequests, rejectedCount } = setup((_call, index) => (index === 0 ? json(401, { ok: false, code: "not_authenticated" }) : json(200, CAPABILITIES)));
    expect((await client.getCapabilities()).plan.label).toBe("Paw Pro");
    expect(tokenRequests).toEqual([false, true]);
    expect(calls.map((call) => call.headers.Authorization)).toEqual(["Bearer token-1", "Bearer token-2"]);
    expect(rejectedCount()).toBe(0);
  });

  it("when PawOS refuses the refreshed token too, the session is ended and the user is told to sign in", async () => {
    const { client, calls, rejectedCount } = setup(() => json(401, { ok: false, code: "not_authenticated", message: "Sign in to continue." }));
    const error = await client.getCapabilities().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PawosApiError);
    expect(error).toMatchObject({ kind: "unauthenticated", status: 401 });
    expect(calls).toHaveLength(2); // no third attempt
    expect(rejectedCount()).toBe(1);
  });

  it("when the session can't be refreshed, nothing more is sent", async () => {
    const { client, calls, rejectedCount } = setup(() => json(401, { ok: false, code: "not_authenticated" }), { refreshed: new AuthRequiredError("expired") });
    await expect(client.getCapabilities()).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(calls).toHaveLength(1);
    expect(rejectedCount()).toBe(0); // the sign-in layer already ended the session itself
  });

  it("signed out: the request is never sent", async () => {
    const calls: string[] = [];
    const client = new PawosClient(
      () => BASE,
      async () => {
        throw new AuthRequiredError("Sign in to PawOS to continue.");
      },
      undefined,
      async (url) => {
        calls.push(url);
        return json(200, CAPABILITIES);
      }
    );
    await expect(client.getCapabilities()).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(calls).toHaveLength(0);
  });
});

describe("other failures", () => {
  it.each([
    [403, { ok: false, code: "capability_locked", message: "Code changes isn't included in your plan." }, "forbidden", "Code changes isn't included in your plan."],
    [429, {}, "rateLimited", "PawOS is receiving too many requests. Wait a moment and try again."],
    [500, { ok: false, code: "failed", message: "Something went wrong. Please try again." }, "server", "Something went wrong. Please try again."],
    [502, {}, "server", "PawOS is having trouble right now. Please try again in a moment."],
    [409, { ok: false, code: "github_not_connected", message: "Connect GitHub to make changes from PawOS Web." }, "rejected", "Connect GitHub to make changes from PawOS Web."],
  ])("HTTP %i becomes a clear message", async (status, body, kind, message) => {
    const { client } = setup(() => json(status, body));
    const error = (await client.getCapabilities().catch((e: unknown) => e)) as PawosApiError;
    expect(error).toBeInstanceOf(PawosApiError);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
  });

  it("no connection is a network failure, and never mentions the token", async () => {
    const { client } = setup(() => {
      throw new TypeError("fetch failed: Bearer token-1");
    });
    const error = (await client.getCapabilities().catch((e: unknown) => e)) as PawosApiError;
    expect(error.kind).toBe("network");
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("token-1");
  });

  it("an error page from something in between is uncertain; PawOS's own 5xx answer is not", async () => {
    const page = (await setup(() => new Response("<html>Bad Gateway</html>", { status: 502 })).client.getCapabilities().catch((e: unknown) => e)) as PawosApiError;
    expect(page.uncertain).toBe(true);
    const own = (await setup(() => json(500, { ok: false, code: "failed", message: "x" })).client.getCapabilities().catch((e: unknown) => e)) as PawosApiError;
    expect(own.uncertain).toBe(false);
  });
});

describe("the repository PawOS works on", () => {
  it("reads it with GET /api/web/github/repository", async () => {
    const readiness = { state: "ready", repository: { fullName: "acme/site", defaultBranch: "main" }, scope: "full" };
    const { client, calls } = setup(() => json(200, { ok: true, readiness }));
    expect(await client.getRepositoryReadiness()).toEqual(readiness);
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://pawos.test/api/web/github/repository" });
  });

  it("selects one with the existing PUT { fullName }", async () => {
    const { client, calls } = setup(() => json(200, { ok: true, readiness: { state: "ready", repository: { fullName: "acme/app", defaultBranch: "main" }, scope: "full" } }));
    await client.selectRepository("acme/app");
    expect(calls[0]).toMatchObject({ method: "PUT", url: "https://pawos.test/api/web/github/repository", body: { fullName: "acme/app" } });
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
  });
});

describe("task request payload", () => {
  const REPLY = { ok: true, chatId: "chat-1", reply: "Done — I pushed the change.", recovered: false, requiresDesktop: false, change: { requestId: "req-12345678", state: "pushed" } };

  it("POST /api/web-chat/messages carries exactly the task, the request id and Code mode", async () => {
    const { client, calls } = setup(() => json(200, REPLY));
    const outcome = await client.sendCodeChange("Rename the Sign in button to Log in", "req-12345678");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://pawos.test/api/web-chat/messages");
    expect(calls[0]!.body).toEqual({ content: "Rename the Sign in button to Log in", requestId: "req-12345678", mode: "codeChange" });
    expect(calls[0]!.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.stringify(calls[0]!.body)).not.toContain("token-1");
    expect(outcome).toMatchObject({ kind: "delivered", result: { chatId: "chat-1", reply: "Done — I pushed the change." } });
  });

  it("202 means PawOS is still working on it", async () => {
    const { client } = setup(() => json(202, { ok: false, code: "processing", message: "Your message is still being answered." }));
    expect(await client.sendCodeChange("x", "req-12345678")).toEqual({ kind: "processing" });
  });

  it("asking about an earlier send never starts a new one", async () => {
    const { client, calls } = setup(() => json(404, { ok: false, code: "not_found", message: "That message wasn't received." }));
    expect(await client.recoverSend("req-12345678")).toEqual({ kind: "notReceived" });
    expect(calls[0]!.body).toEqual({ requestId: "req-12345678", recoverOnly: true });
  });

  it("a refusal carries PawOS's own reason", async () => {
    const { client } = setup(() => json(402, { ok: false, code: "usage_limit_reached", message: "Your plan's included usage is used up. Add usage or upgrade to keep going." }));
    await expect(client.sendCodeChange("x", "req-12345678")).rejects.toMatchObject({ kind: "rejected", code: "usage_limit_reached", message: "Your plan's included usage is used up. Add usage or upgrade to keep going." });
  });
});

describe("GET /api/web/changes/<request id>", () => {
  it("returns the change, and null while PawOS has no record of it yet", async () => {
    const change = { requestId: "req-12345678", state: "running", steps: [{ id: "read", label: "Read the repository", status: "active" }] };
    const found = setup(() => json(200, { ok: true, change }));
    expect(await found.client.getChange("req-12345678")).toEqual(change);
    expect(found.calls[0]).toMatchObject({ method: "GET", url: "https://pawos.test/api/web/changes/req-12345678" });
    expect(found.calls[0]!.headers.Authorization).toBe("Bearer token-1");

    const missing = setup(() => json(404, { ok: false, code: "not_found", message: "That change doesn't exist." }));
    expect(await missing.client.getChange("req-12345678")).toBeNull();
  });
});
