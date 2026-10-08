import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { API, harness, reply } from "../testing/harness";
import { PawosApiError, PawosClient } from "../shared";
import { plain } from "../ui/terminal";
import { debugLine } from "./interactive";

/**
 * PAWOS_DEBUG: when a message fails, also say what PawOS actually answered — the endpoint, the HTTP
 * status, PawOS's error code, the failure class the server gives, and how long it took. It is for
 * finding the real cause; it is off unless asked for, and it never prints a token, a key or a body.
 */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const HOME = "C:\\pawos-test";
const NOT_GIT = { kind: "notGit" } as const;
const busy = () => reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again.", detail: "model_http_429" }, 502);

describe("debug output", () => {
  it("off by default: a failure shows PawOS's safe message and nothing else", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [busy()];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Paw couldn't answer just now. Please try again.");
    expect(h.output()).not.toMatch(/debug:|502|model_unavailable|model_http_429|\/api\//);
  });

  it("on: the same safe message, then one line with the endpoint, status, code, failure class and time", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT, debug: true });
    h.server.chatReplies = [busy()];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Paw couldn't answer just now. Please try again.");
    expect(h.output()).toMatch(/\n {2}debug: POST \/api\/web-chat\/messages status=502 kind=server code=model_unavailable detail=model_http_429 after=\d+\.\ds\n/);
  });

  it.each([
    [reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again.", detail: "model_timeout" }, 502), "status=502 kind=server code=model_unavailable detail=model_timeout"],
    [reply({ code: "usage_limit_reached", message: "Limit reached." }, 402), "status=402 kind=rejected code=usage_limit_reached"],
    [reply({ code: "capability_locked", message: "Chat isn't included in your plan." }, 403), "status=403 kind=forbidden code=capability_locked"],
    [new Error("socket hang up"), "status=404 kind=rejected code=not_found"], // no answer, then PawOS said it never got it
  ])("says what really came back (%#)", async (answer, expected) => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT, debug: true });
    h.server.chatReplies = [answer];
    await runCli([], h.ctx);
    expect(h.output()).toContain(`debug: POST /api/web-chat/messages ${expected}`);
  });

  it("never prints a token, a key, the message or anything free-form from the server", async () => {
    const h = start({ signedIn: true, answers: ["my secret question", null], cwd: HOME, local: NOT_GIT, debug: true });
    h.server.chatReplies = [reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again.", detail: "KEY=AIza-secret; drop table", stack: "at generate (model.ts:60)", apiKey: "AIza-secret" }, 502)];
    await runCli([], h.ctx);
    const debug = h.output().split("\n").find((text) => text.includes("debug:"))!;
    expect(debug).toBe(debug.replace(/detail=\S+/, "")); // a detail that isn't a plain identifier is dropped
    for (const secret of ["AIza", "secret", "drop table", "model.ts", "access-", "refresh-", "Bearer", "my secret question"]) expect(debug).not.toContain(secret);
    expect(h.raw()).not.toContain("AIza");
  });

  it("a successful reply prints no debug line", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT, debug: true });
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("debug:");
  });

  it("the client keeps the server's failure class only when it is a short identifier", async () => {
    const client = (body: unknown, status: number) => new PawosClient(() => API, async () => "token", async () => undefined, async () => new Response(JSON.stringify(body), { status }));
    await expect(client({ ok: false, code: "model_unavailable", message: "x", detail: "model_http_503" }, 502).sendChat("hii", "request-0001")).rejects.toMatchObject({ status: 502, code: "model_unavailable", detail: "model_http_503" });
    for (const detail of ["Has Spaces", "x".repeat(41), "semi;colon", 42, null, { a: 1 }]) {
      await expect(client({ ok: false, code: "model_unavailable", message: "x", detail }, 502).sendChat("hii", "request-0002")).rejects.toMatchObject({ code: "model_unavailable", detail: null });
    }
  });

  it("the line by itself", () => {
    expect(plain([debugLine(new PawosApiError("server", "x", 502, "model_unavailable", "model_timeout"), 54_716)])).toBe("  debug: POST /api/web-chat/messages status=502 kind=server code=model_unavailable detail=model_timeout after=54.7s");
    expect(plain([debugLine(new PawosApiError("network", "x"), 90_000)])).toBe("  debug: POST /api/web-chat/messages status=none kind=network code=none after=90.0s");
    expect(plain([debugLine(new Error("boom"), 10)])).toBe("  debug: POST /api/web-chat/messages status=none kind=unknown code=none after=0.0s");
  });
});
