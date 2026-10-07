import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { HANDOFF, completionUrl, harness, reply } from "../testing/harness";

/** The local repository against the one selected in PawOS: shown, compared, and never switched silently. */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const puts = (h: ReturnType<typeof harness>) => h.server.calls.filter((call) => call.method === "PUT" && call.path === "/api/web/github/repository");

describe("matching repository", () => {
  it("shows the repository and goes straight to the prompt, asking nothing", async () => {
    const h = start({ signedIn: true, answers: [null] });
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("  Repository: acme/site");
    expect(output).not.toContain("do not match");
    expect(h.prompter.prompts).toEqual(["  > "]);
    expect(h.output()).toContain("Code mode: changes go to acme/site on GitHub. /chat to just talk.");
    expect(puts(h)).toHaveLength(0);
    expect(h.server.calls.some((call) => call.method === "GET" && call.path === "/api/web/github/repository")).toBe(true);
  });

  it("GitHub names match whatever their letter case", async () => {
    const h = start({ signedIn: true, local: { kind: "github", fullName: "Acme/Site", remote: "origin" }, answers: [null] });
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("do not match");
    expect(puts(h)).toHaveLength(0);
  });

  it("says plainly where PawOS works", async () => {
    const help = start({});
    await runCli(["help"], help.ctx);
    expect(help.output()).toContain("your connected GitHub project, not in the files on this computer.");
    // And it never claims to edit the files in the local folder.
    const h = start({ signedIn: true, answers: [null] });
    await runCli([], h.ctx);
    expect(h.output()).toContain("Code mode: changes go to acme/site on GitHub.");
    expect(h.output()).not.toMatch(/edits? your local|local files|working tree/i);
  });
});

describe("mismatching repository", () => {
  const local = { kind: "github", fullName: "acme/local-repo", remote: "origin" } as const;

  it("shows both repositories and asks before doing anything", async () => {
    const h = start({ signedIn: true, local, answers: ["n"] });
    h.server.readiness = { state: "ready", repository: { fullName: "acme/other-repo", defaultBranch: "main" }, scope: "full" };
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toMatch(/Local repository:\s+acme\/local-repo/);
    expect(output).toMatch(/PawOS repository:\s+acme\/other-repo/);
    expect(output).toContain("These repositories do not match.");
    expect(h.prompter.prompts[0]).toBe("  Use the local repository in PawOS? [Y/n] ");
  });

  it("confirmation before switching: a no changes nothing and runs no code task — PawOS stays open, without Code mode", async () => {
    const h = start({ signedIn: true, local, answers: ["n", "fix the bug", null] });
    h.server.readiness = { state: "ready", repository: { fullName: "acme/other-repo", defaultBranch: "main" }, scope: "full" };
    expect(await runCli([], h.ctx)).toBe(0);
    expect(puts(h)).toHaveLength(0);
    expect(h.server.starts()).toHaveLength(0); // nothing was sent as a code change, to either repository
    expect(h.output()).toContain("Nothing was changed. Code changes stay off here until the repositories match.");
    expect(h.output()).toContain("What would you like to work on?"); // PawOS itself still starts
    expect(h.output()).not.toContain("Code mode:");
    // What the user typed next was a message to PawOS, not a change to acme/other-repo.
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["fix the bug"]);
  });

  it("no answer at all (input ended) is not a yes", async () => {
    const h = start({ signedIn: true, local, answers: [] });
    h.server.readiness = { state: "ready", repository: { fullName: "acme/other-repo", defaultBranch: "main" }, scope: "full" };
    await runCli([], h.ctx);
    expect(puts(h)).toHaveLength(0);
  });

  it.each([["y"], ["Y"], ["yes"], [""]])("on %j, switches PawOS to the local repository through the existing API, then continues", async (answer) => {
    const h = start({ signedIn: true, local, answers: [answer, null] });
    h.server.readiness = { state: "ready", repository: { fullName: "acme/other-repo", defaultBranch: "main" }, scope: "full" };
    expect(await runCli([], h.ctx)).toBe(0);
    expect(puts(h)).toHaveLength(1);
    expect(puts(h)[0]!.body).toEqual({ fullName: "acme/local-repo" });
    expect(puts(h)[0]!.authorization).toMatch(/^Bearer /);
    // The header shows what Git reports for this folder; PawOS now works on the same repository.
    expect(h.output()).toContain("  Repository: acme/local-repo");
    expect(h.server.readiness).toMatchObject({ state: "ready", repository: { fullName: "acme/local-repo" } });
    expect(h.output()).toContain("What would you like to work on?");
  });

  it("failed repository switch: PawOS's reason is shown and no code task can be run", async () => {
    const h = start({ signedIn: true, local, answers: ["y", "fix the bug", null] });
    h.server.readiness = { state: "ready", repository: { fullName: "acme/other-repo", defaultBranch: "main" }, scope: "full" };
    h.server.selectAnswer = reply({ code: "repository_no_access", message: "Your GitHub account can't push to that repository, so PawOS can't make changes there." }, 403);
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("PawOS couldn't switch to this repository.");
    expect(h.output()).toContain("Your GitHub account can't push to that repository, so PawOS can't make changes there.");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.output()).not.toContain("Code mode:");
    expect(h.output()).toContain("What would you like to work on?");
  });
});

describe("no repository selected in PawOS yet", () => {
  it("offers the local one, and selects it only on a yes", async () => {
    const declined = start({ signedIn: true, answers: ["n"] });
    declined.server.readiness = { state: "noRepository" };
    await runCli([], declined.ctx);
    expect(declined.output()).toContain("PawOS has no repository selected yet.");
    expect(puts(declined)).toHaveLength(0);

    const accepted = start({ signedIn: true, answers: ["y", null] });
    accepted.server.readiness = { state: "noRepository" };
    await runCli([], accepted.ctx);
    expect(puts(accepted)[0]!.body).toEqual({ fullName: "acme/site" });
    expect(accepted.output()).toContain("What would you like to work on?");
  });
});

describe("when PawOS can't make changes for this account", () => {
  it.each([
    [{ state: "githubNotConnected" } as const, "GitHub isn't connected to your PawOS account."],
    [{ state: "githubNeedsReauth" } as const, "Your PawOS GitHub connection needs to be renewed."],
  ])("says why, offers to connect, and without it runs no code task — PawOS still opens: %j", async (readiness, message) => {
    const h = start({ signedIn: true, answers: ["n", "fix the bug", null] });
    h.server.readiness = readiness;
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain(message);
    expect(h.prompter.prompts[0]).toBe("  Connect GitHub now? [Y/n] ");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.output()).toContain("What would you like to work on?");
    expect(h.output()).not.toContain("Code mode:");
  });

  it("a plan without code changes: no Code mode, and /code says why — PawOS still opens", async () => {
    const h = start({ signedIn: true, answers: ["/code", "fix the bug", null] });
    h.server.readiness = { state: "locked", availableOn: "Paw Pro" };
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Code changes aren't available here.");
    expect(h.output()).toContain("Code changes aren't included in your plan (available on Paw Pro).");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()).toHaveLength(1);
  });

  it.each([
    [reply({ code: "forbidden", message: "Your PawOS plan or permissions don't allow that." }, 403), "Your PawOS plan or permissions don't allow that."],
    [reply({}, 429), "PawOS is receiving too many requests. Wait a moment and try again."],
    [new Response("<html>Bad Gateway</html>", { status: 502 }), "PawOS is having trouble right now. Please try again in a moment."],
    [new Error("ECONNRESET"), "PawOS couldn't be reached. Check your connection and try again."],
  ])("a failed load is shown as it is", async (answer, message) => {
    const h = start({ signedIn: true, answers: ["fix the bug"] });
    h.server.capabilitiesAnswer = answer;
    expect(await runCli([], h.ctx)).toBe(1);
    expect(h.output()).toContain(message);
    expect(h.output()).not.toContain("ECONNRESET");
  });

  it("a session that expired between runs asks the user to sign in again, then carries on", async () => {
    const h = start({ signedIn: true, answers: [completionUrl(), null] });
    h.server.validRefresh.clear();
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Your PawOS session has expired. Sign in again.");
    expect(h.output()).toContain("To sign in, open this URL in your browser:");
    expect(h.output()).toContain("What would you like to work on?");
  });
});
