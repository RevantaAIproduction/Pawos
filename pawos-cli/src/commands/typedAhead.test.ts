import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../cli";
import { finishTurn, harness, toolTurn } from "../testing/harness";
import { WRITE_QUESTION } from "./workspace";

/**
 * Which questions may use what was typed while PawOS worked (ui/prompts.ts, TypedAhead): only the
 * main prompt — where it is shown on the input line, unsent. An approval, the consent question and
 * the exit question never do, so an early "y" can't approve anything.
 */
let outer: string;
let root: string;
beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-typed-ahead-")));
  root = path.join(outer, "shop");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "package.json"), "{}");
});
afterEach(() => fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

it("only the main prompt keeps typed-ahead text; approvals and the consent question never do", async () => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, local: { kind: "notGit" }, answers: ["add a readme", "y", "y", null], permissionMode: "ask" });
  h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "README.md", content: "# Shop\n" }), finishTurn("Added README.md.")];
  expect(await runCli([], h.ctx)).toBe(0);
  const asked = h.prompter.prompts.map((prompt, index) => ({ prompt, keep: h.prompter.options[index]?.keepTypedAhead === true }));
  const main = asked.filter((question) => question.prompt.trim() === ">");
  const others = asked.filter((question) => question.prompt.trim() !== ">");
  expect(main.length).toBeGreaterThanOrEqual(2);
  expect(main.every((question) => question.keep)).toBe(true);
  expect(others.map((question) => question.prompt)).toContain(WRITE_QUESTION);
  expect(others.every((question) => !question.keep)).toBe(true);
  expect(fs.readFileSync(path.join(root, "README.md"), "utf8")).toBe("# Shop\n");
});
