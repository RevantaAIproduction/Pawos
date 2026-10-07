import { describe, expect, it } from "vitest";
import { PawosApiError, sendChatMessage, type SendOutcome, type SendResult } from "../shared";

/** The shared chat sender: one message, sent once, whatever happens to the connection. */
const result = (text: string): SendResult => ({ chatId: "chat-1", reply: text, recovered: false, requiresDesktop: false }) as SendResult;
const delivered = (text: string): SendOutcome => ({ kind: "delivered", result: result(text) });

function scripted(first: SendOutcome | Error, later: (SendOutcome | Error)[] = []) {
  const calls: string[] = [];
  let time = 0;
  const play = (entry: SendOutcome | Error) => {
    if (entry instanceof Error) throw entry;
    return entry;
  };
  return {
    calls,
    options: {
      client: {
        sendChat: async (content: string, requestId: string, chatId?: string | null) => {
          calls.push(`send ${requestId} ${chatId ?? "-"} ${content}`);
          return play(first);
        },
        recoverSend: async (requestId: string) => {
          calls.push(`recover ${requestId}`);
          return play(later.length > 1 ? later.shift()! : later[0]!);
        },
      },
      sleep: async (ms: number) => {
        time += ms;
      },
      now: () => time,
    },
  };
}

describe("sendChatMessage", () => {
  it("returns PawOS's reply, and passes the conversation along", async () => {
    const s = scripted(delivered("Hello."));
    expect((await sendChatMessage({ ...s.options, content: "hi", requestId: "r1", chatId: "chat-7" })).reply).toBe("Hello.");
    expect(s.calls).toEqual(["send r1 chat-7 hi"]);
  });

  it("while PawOS is still answering it only asks about the same request", async () => {
    const s = scripted({ kind: "processing" }, [{ kind: "processing" }, delivered("Done.")]);
    expect((await sendChatMessage({ ...s.options, content: "hi", requestId: "r2" })).reply).toBe("Done.");
    expect(s.calls).toEqual(["send r2 - hi", "recover r2", "recover r2"]);
  });

  it("a dropped connection is followed by a lookup, never a second send", async () => {
    const s = scripted(new PawosApiError("network", "socket hang up"), [new PawosApiError("network", "still down"), delivered("Recovered.")]);
    expect((await sendChatMessage({ ...s.options, content: "hi", requestId: "r3" })).reply).toBe("Recovered.");
    expect(s.calls.filter((call) => call.startsWith("send"))).toHaveLength(1);
  });

  it("a refusal is passed straight on — a limit or plan refusal is never retried", async () => {
    for (const refusal of [new PawosApiError("rejected", "Limit reached.", 402, "usage_limit_reached"), new PawosApiError("forbidden", "Not in your plan.", 403, "capability_locked"), new PawosApiError("unauthenticated", "Sign in again.", 401, null)]) {
      const s = scripted(refusal);
      await expect(sendChatMessage({ ...s.options, content: "hi", requestId: "r4" })).rejects.toBe(refusal);
      expect(s.calls).toEqual(["send r4 - hi"]);
    }
  });

  it("if PawOS never received it, it says so rather than sending it again by itself", async () => {
    const s = scripted(new PawosApiError("network", "reset"), [{ kind: "notReceived" }]);
    await expect(sendChatMessage({ ...s.options, content: "hi", requestId: "r5" })).rejects.toThrow("PawOS didn't receive the message. Send it again.");
    expect(s.calls.filter((call) => call.startsWith("send"))).toHaveLength(1);
  });

  it("gives up waiting after a while, and after repeated connection failures", async () => {
    const slow = scripted({ kind: "processing" }, [{ kind: "processing" }]);
    await expect(sendChatMessage({ ...slow.options, content: "hi", requestId: "r6", waitMs: 10_000 })).rejects.toThrow(/taking longer than expected/);
    expect(slow.calls.filter((call) => call.startsWith("send"))).toHaveLength(1);

    const down = scripted(new PawosApiError("network", "down"), [new PawosApiError("network", "down")]);
    await expect(sendChatMessage({ ...down.options, content: "hi", requestId: "r7" })).rejects.toThrow("down");
    expect(down.calls.filter((call) => call.startsWith("send"))).toHaveLength(1);
  });
});
