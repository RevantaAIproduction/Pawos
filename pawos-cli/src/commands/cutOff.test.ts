import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../cli";
import { finishTurn, harness, reply, toolTurn } from "../testing/harness";

/**
 * PawOS's reply for the next step was cut off at the output limit (the server says
 * model_reply_truncated). The CLI sends the same turn again — PawOS then asks its model for a smaller
 * step — and says that is what is happening; nothing already run is run again. When PawOS gives up on
 * the step (step_too_large), the task ends with PawOS's reason, and what was done before is kept.
 */
let outer: string;
let root: string;
beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-cut-off-")));
  root = path.join(outer, "shop");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "package.json"), "{}");
});
afterEach(() => fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

const truncated = () => reply({ code: "model_unavailable", message: "PawOS's reply was cut off before it was complete. It is asking for a smaller step.", detail: "model_reply_truncated" }, 502);
const tooLarge = () =>
  reply({ code: "step_too_large", message: "PawOS stopped: its next step was too large to write in one reply, even when asked for a smaller one. Nothing from that step was run; everything done before it is kept. Ask for the rest in smaller parts — one file or one section at a time.", detail: "model_reply_truncated" }, 422);

it("a cut-off reply is asked for again, said as such, and the step that follows is run once", async () => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, local: { kind: "notGit" }, answers: ["build the storefront", null], permissionMode: "auto" });
  h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "src/data.ts", content: "export const a = 1;\n" }), truncated(), toolTurn("step-2", "write_file", { path: "src/b.ts", content: "export const b = 2;\n" }), finishTurn("Done.")];
  expect(await runCli([], h.ctx)).toBe(0);
  expect(h.output()).toContain("PawOS's reply was cut off — asking for a smaller step (1 of 5)");
  const results = h.server.agentCalls().slice(1).map((call) => (call.body!.result as { id: string }).id);
  expect(results).toEqual(["step-1", "step-1", "step-2"]); // step-1's result sent again, not run again
  expect(fs.readFileSync(path.join(root, "src", "data.ts"), "utf8")).toBe("export const a = 1;\n");
  expect(fs.readFileSync(path.join(root, "src", "b.ts"), "utf8")).toBe("export const b = 2;\n");
});

it("a step PawOS can't make small enough ends the task with PawOS's reason — not retried, earlier changes kept, /undo still works", async () => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, local: { kind: "notGit" }, answers: ["build the storefront", "/undo", "y", null], permissionMode: "auto" });
  h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "src/data.ts", content: "export const a = 1;\n" }), truncated(), truncated(), tooLarge()];
  await runCli([], h.ctx);
  const screen = h.output();
  expect(screen).toContain("too large to write in one reply");
  expect(screen).toContain("Ask for the rest in smaller parts");
  expect(h.server.agentCalls()).toHaveLength(4); // start, step-1's result, and two sends again — then no more
  // The file written before the step that failed was kept and reported, and /undo takes it back.
  expect(screen).toContain("Created 1, modified 0, deleted 0.");
  expect(screen).toContain("/undo puts these files back");
  expect(fs.existsSync(path.join(root, "src", "data.ts"))).toBe(false);
});

it("the wait PawOS suggests (retryAfterMs in its answer) is the wait the CLI takes before sending the turn again", async () => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, local: { kind: "notGit" }, answers: ["build the storefront", null], permissionMode: "auto" });
  h.server.agentTurns = [reply({ code: "model_unavailable", message: "Paw couldn't answer just now.", detail: "model_http_503", retryAfterMs: 4321 }, 502), finishTurn("Done.")];
  expect(await runCli([], h.ctx)).toBe(0);
  expect(h.waited()).toBe(4321);
  expect(h.server.agentCalls()).toHaveLength(2);
});
