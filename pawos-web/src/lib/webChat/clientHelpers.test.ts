import { describe, expect, it } from "vitest";
import { splitAttachment, splitMessage } from "./formatMessage";
import { PENDING_SEND_KEY, newRequestId, readPendingSend, retryDelayMs, writePendingSend, type PendingSend } from "./pendingSend";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("splitMessage", () => {
  it("separates prose from fenced code and keeps the language", () => {
    expect(splitMessage("Run this:\n```bash\nnpm test\n```\nThen commit.")).toEqual([
      { kind: "text", text: "Run this:" },
      { kind: "code", language: "bash", text: "npm test" },
      { kind: "text", text: "Then commit." },
    ]);
  });

  it("treats an unclosed fence as code to the end, and plain text as one segment", () => {
    expect(splitMessage("```ts\nconst a = 1;")).toEqual([{ kind: "code", language: "ts", text: "const a = 1;" }]);
    expect(splitMessage("Just words.")).toEqual([{ kind: "text", text: "Just words." }]);
  });

  it("returns markup as text, never as HTML", () => {
    expect(splitMessage("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
  });
});

describe("splitAttachment", () => {
  it("separates what was typed from the file block the server appended", () => {
    expect(splitAttachment("review this\n\nAttached file: notes.md\n```\n# Notes\n```")).toEqual({ text: "review this", attachmentName: "notes.md" });
    expect(splitAttachment("no file here")).toEqual({ text: "no file here", attachmentName: null });
  });
});

describe("the pending-send note", () => {
  const pending: PendingSend = { requestId: "3f1c2a9e-7b64-4d0a-9c1e-5a2b8d4f6e10", chatId: null, content: "hello", attachmentName: "notes.md" };

  it("round-trips through storage and is removed when cleared", () => {
    const store = memoryStore();
    writePendingSend(store, pending);
    expect(readPendingSend(store)).toEqual(pending);
    writePendingSend(store, null);
    expect(readPendingSend(store)).toBeNull();
  });

  it("stores the message text and ids only — never a file's content", () => {
    const store = memoryStore();
    writePendingSend(store, pending);
    expect(Object.keys(JSON.parse(store.values.get(PENDING_SEND_KEY) as string)).sort()).toEqual(["attachmentName", "chatId", "content", "requestId"]);
  });

  it("ignores a corrupted or foreign value instead of throwing", () => {
    const store = memoryStore();
    store.setItem(PENDING_SEND_KEY, "{not json");
    expect(readPendingSend(store)).toBeNull();
    store.setItem(PENDING_SEND_KEY, JSON.stringify({ requestId: 7 }));
    expect(readPendingSend(store)).toBeNull();
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPendingSend(broken)).toBeNull();
    expect(() => writePendingSend(broken, pending)).not.toThrow();
  });

  it("makes request ids the server accepts, and different each time", () => {
    const ids = new Set(Array.from({ length: 50 }, newRequestId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it("retries a few times with growing delays, then stops and asks", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([1500, 4000, 10_000]);
    expect(retryDelayMs(4)).toBeNull();
  });
});
