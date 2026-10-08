import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { ALICE, HANDOFF, completionUrl, harness, integration, reply } from "../testing/harness";
import { findIntegration } from "./connections";
import { QUESTION } from "./interactive";

/**
 * PawOS from any folder. Git is optional context: the account, its connections and PawOS itself
 * are the same in C:\Users\APPLE as in a project. These tests also pin down what the CLI does NOT
 * do — it runs no connector, MCP server or OAuth flow of its own; it asks PawOS.
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

const HOME = "C:\\Users\\APPLE";
const NOT_GIT = { kind: "notGit" } as const;
const RULE = "─".repeat(40);
const sources = () => {
  const root = path.join(__dirname, "..");
  return fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.includes("testing"))
    .map((file) => ({ file: file.replace(/\\/g, "/"), source: fs.readFileSync(path.join(root, file), "utf8") }));
};

describe("PawOS normal mode: started outside Git", () => {
  it("starts outside Git and displays only the folder — no Git line, no Repository line", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toBe(["", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
    expect(h.output()).not.toMatch(/Git:|Repository:/);
  });

  it.each([[HOME], ["C:\\Users\\APPLE\\Documents"], ["/tmp"], ["/"]])("works from %s: Git is not required to start PawOS", async (cwd) => {
    for (const local of [NOT_GIT, { kind: "gitMissing" } as const]) {
      const h = start({ signedIn: true, answers: [null], cwd, local });
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.output()).toContain(`  ${cwd}`);
      expect(h.output()).toContain(QUESTION);
    }
  });

  it("the interactive prompt works, and a normal AI request is answered by PawOS", async () => {
    const h = start({ signedIn: true, answers: ["explain how React hooks work", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ chatId: "chat-9", reply: "Hooks let function components keep state.\n\nuseState returns a value and a setter.", recovered: false, requiresDesktop: false })];
    expect(await runCli([], h.ctx)).toBe(0);
    // The existing PawOS chat endpoint, with no mode: a message, not a code change.
    const [sent] = h.server.chats();
    expect(sent).toMatchObject({ method: "POST", path: "/api/web-chat/messages" });
    expect(Object.keys(sent!.body!).sort()).toEqual(["content", "requestId"]);
    expect(sent!.body!.content).toBe("explain how React hooks work");
    expect(sent!.authorization).toMatch(/^Bearer /);
    expect(h.server.starts()).toHaveLength(0);
    const output = h.output();
    expect(output).toContain("  ◉ PawOS is thinking…");
    expect(output).toContain("  Hooks let function components keep state.\n\n  useState returns a value and a setter.");
    expect(output.lastIndexOf(QUESTION)).toBeGreaterThan(output.indexOf("useState returns")); // back at the prompt
  });

  it("a conversation continues: the next message goes to the same PawOS chat", async () => {
    const h = start({ signedIn: true, answers: ["help me design a SaaS application", "and the billing part?", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ chatId: "chat-42", reply: "Start with the tenants.", recovered: false, requiresDesktop: false })];
    await runCli([], h.ctx);
    const [first, second] = h.server.chats();
    expect(first!.body!.chatId).toBeUndefined();
    expect(second!.body!.chatId).toBe("chat-42");
    expect(first!.body!.requestId).not.toBe(second!.body!.requestId);
  });

  it("a dropped connection never sends the message twice", async () => {
    const h = start({ signedIn: true, answers: ["summarize this information", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [new Error("socket hang up")];
    h.server.recoveries = [reply({ code: "processing", message: "Your message is still being answered." }, 202), reply({ chatId: "c", reply: "Here is the summary.", recovered: true, requiresDesktop: false })];
    await runCli([], h.ctx);
    expect(h.server.chats()).toHaveLength(1);
    expect(h.server.recovers().length).toBeGreaterThanOrEqual(2);
    expect(h.output()).toContain("Here is the summary.");
    expect(h.output()).not.toContain("socket hang up");
  });

  it("a reply can't inject control sequences into the terminal", async () => {
    const esc = String.fromCharCode(27);
    const h = start({ signedIn: true, answers: ["hi", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ chatId: "c", reply: `Done${esc}[2J${esc}]0;title${String.fromCharCode(7)}`, recovered: false, requiresDesktop: false })];
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain(esc);
  });

  it("is not a reduced mode: the account, its plan and its connections are all there", async () => {
    const h = start({ signedIn: true, answers: ["/status", "/connections", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = [integration("github", "GitHub", { connection: "connected", accountLabel: "octocat" }), integration("slack", "Slack")];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("PawOS Account");
    expect(output).toMatch(/Account\s+alice@example\.com · Paw Pro/);
    expect(output).toMatch(/Connections\s+GitHub/);
    expect(output).toMatch(/Folder\s+not a Git repository/);
    expect(output).toContain("✓ GitHub  octocat");
    expect(output).toContain("○ Slack  not connected");
  });

  it("/help lists the workspace's commands, and an unknown one is never sent to PawOS as a message", async () => {
    const h = start({ signedIn: true, answers: ["/help", "/deploy everything", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    for (const command of ["/code", "/chat", "/connections", "/connect <name>", "/status", "/help", "/exit"]) expect(h.output()).toContain(command);
    expect(h.output()).toContain("Unknown command: /deploy");
    expect(h.server.chats()).toHaveLength(0);
  });

  it("signed out in a normal folder: sign in, then straight into the same workspace", async () => {
    const h = start({ answers: [completionUrl(), "hello", null], cwd: HOME, local: NOT_GIT });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output.indexOf(`✓ Signed in as ${ALICE.email}`)).toBeLessThan(output.indexOf(`  ${HOME}`));
    expect(h.server.chats()).toHaveLength(1);
  });
});

describe("Git is optional project context", () => {
  it("inside a GitHub project the same workspace opens, with Code mode on top", async () => {
    const h = start({ signedIn: true, answers: [null] });
    await runCli([], h.ctx);
    expect(h.output()).toContain("  Repository: acme/site");
    expect(h.output()).toContain("Code mode: changes go to acme/site on GitHub. /chat to just talk.");
  });

  it("/chat and /code switch between talking and changing code, and each message goes where the screen says", async () => {
    const h = start({ signedIn: true, answers: ["/chat", "what does this project do?", "/code", null] });
    await runCli([], h.ctx);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["what does this project do?"]);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.output()).toContain("Chat. /code to make changes in acme/site.");
  });

  it("nothing in the workspace decides what is available from Git: only Code mode looks at the repository", () => {
    for (const { file, source } of sources()) {
      if (file === "git/localRepository.ts") continue;
      // The only use of the repository kind outside Git detection is the header, the status row and Code mode.
      if (/repository\.kind|local\.kind/.test(source)) expect(["commands/interactive.ts", "commands/status.ts"]).toContain(file);
    }
    const connections = sources().find(({ file }) => file === "commands/connections.ts")!.source;
    expect(connections).not.toMatch(/detectProject|repository\.kind|branch|isGit/);
  });
});

describe("MCP", () => {
  it("MCP available outside Git: what PawOS reports for the account is the same in any folder", async () => {
    const outside = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    const inside = start({ signedIn: true });
    await runCli(["status"], outside.ctx);
    await runCli(["status"], inside.ctx);
    const row = (text: string) => text.split("\n").find((line) => line.includes("Connected tools"));
    expect(row(outside.output())).toBe(row(inside.output()));
    // PawOS's own answer today (pawos-web webCapabilities.ts: web.mcpRead is "desktopOnly").
    expect(row(outside.output())).toMatch(/Connected tools\s+PawOS Desktop only/);
  });

  it("MCP request from a normal directory: it is sent to PawOS exactly as it would be from a project", async () => {
    const outside = start({ signedIn: true, answers: ["check my GitHub issues", null], cwd: HOME, local: NOT_GIT });
    const inside = start({ signedIn: true, answers: ["/chat", "check my GitHub issues", null] });
    await runCli([], outside.ctx);
    await runCli([], inside.ctx);
    const shape = (h: ReturnType<typeof harness>) => ({ path: h.server.chats()[0]!.path, keys: Object.keys(h.server.chats()[0]!.body!).sort(), content: h.server.chats()[0]!.body!.content });
    expect(shape(outside)).toEqual(shape(inside));
  });

  it("the CLI shows PawOS's real answer — it never makes up a result PawOS didn't give", async () => {
    const h = start({ signedIn: true, answers: ["check my GitHub issues", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ chatId: "c", reply: "Reading your GitHub issues requires PawOS Desktop. Here is how to triage them once you have them open.", recovered: false, requiresDesktop: true })];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("Reading your GitHub issues requires PawOS Desktop.");
    expect(output).toContain("PawOS says this needs the PawOS desktop app. Nothing was done from here.");
    expect(output).not.toMatch(/Found \d+ issues|✓ Found/);
  });

  it("MCP authentication requirement: a service that isn't connected is connected through PawOS, then the prompt returns", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = [integration("github", "GitHub")];
    const done = h.prompter.ask.bind(h.prompter);
    h.prompter.ask = async (prompt) => {
      // The user finishes in the browser while the CLI waits.
      if (prompt.includes("press Enter to check again")) h.server.integrations = [integration("github", "GitHub", { connection: "connected", accountLabel: "octocat" })];
      return done(prompt);
    };
    await runCli([], h.ctx);
    expect(h.output()).toContain("  GitHub is not connected.");
    expect(h.output()).toContain("✓ GitHub connected  octocat");
    expect(h.output().lastIndexOf(QUESTION)).toBeGreaterThan(h.output().indexOf("✓ GitHub connected"));
  });

  it("MCP failure handling: PawOS's refusal or failure is shown plainly, and the prompt returns", async () => {
    for (const [answer, message] of [
      [reply({ code: "capability_locked", message: "MCP read access needs the PawOS desktop app." }, 403), "MCP read access needs the PawOS desktop app."],
      [reply({ code: "failed", message: "Something went wrong. Please try again." }, 500), "Something went wrong. Please try again."],
      [new Response("<html>502</html>", { status: 502 }), "PawOS is having trouble right now. Please try again in a moment."],
    ] as const) {
      const h = start({ signedIn: true, answers: ["summarize my Slack messages", null], cwd: HOME, local: NOT_GIT });
      h.server.chatReplies = [answer];
      h.server.recoveries = [reply({ code: "not_found", message: "That message wasn't received." }, 404)];
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.output()).toContain(message === "PawOS is having trouble right now. Please try again in a moment." ? "PawOS didn't receive the message. Send it again." : message);
      expect(h.output()).not.toMatch(/at \w+ \(|Error:|stack/); // no stack trace or internals
      expect(h.output().lastIndexOf(QUESTION)).toBeGreaterThan(0);
    }
  });

  it("there is no CLI-only MCP: the CLI contains no MCP client, no connector SDK, and talks to no host but PawOS", () => {
    for (const { source } of sources()) {
      expect(source).not.toMatch(/modelcontextprotocol|mcp-server|StdioClientTransport|api\.github\.com|slack\.com\/api|api\.linear\.app|googleapis\.com|atlassian\.net|notion\.com/i);
      expect(source).not.toMatch(/client_secret|CLIENT_SECRET|access_token|Authorization: /);
    }
  });
});

describe("connectors", () => {
  const connectors = [
    integration("github", "GitHub", { connection: "connected", accountLabel: "octocat", group: "sourceControl" }),
    integration("slack", "Slack"),
    integration("jira", "Jira", { connection: "needsReauth" }),
    integration("linear", "Linear", { entitled: false, availableOn: "Paw Pro Max" }),
  ];

  it("connector available outside Git: /connections shows the account's connectors from any folder", async () => {
    const outside = start({ signedIn: true, answers: ["/connections", null], cwd: HOME, local: NOT_GIT });
    const inside = start({ signedIn: true, answers: ["/connections", null] });
    outside.server.integrations = connectors;
    inside.server.integrations = connectors;
    await runCli([], outside.ctx);
    await runCli([], inside.ctx);
    const block = (text: string) => text.slice(text.indexOf("  Connections\n"), text.indexOf("/connect <name> to connect one."));
    expect(block(outside.output())).toBe(["  Connections", "", "  ✓ GitHub  octocat", "  ○ Slack  not connected", "  ✕ Jira  needs to be reconnected", "  – Linear  not included in your plan (available on Paw Pro Max)", "", "  "].join("\n"));
    expect(block(outside.output())).toBe(block(inside.output()));
    expect(outside.server.calls.some((call) => call.method === "GET" && call.path === "/api/dashboard/integrations")).toBe(true);
  });

  it("connector request: asking PawOS to use one is a message to PawOS, whatever the folder", async () => {
    for (const request of ["summarize my Slack messages", "find a document in Google Drive", "create a Linear ticket"]) {
      const h = start({ signedIn: true, answers: [request, null], cwd: HOME, local: NOT_GIT });
      await runCli([], h.ctx);
      expect(h.server.chats().map((call) => call.body?.content)).toEqual([request]);
      // The CLI itself called nothing but PawOS (the scripted server refuses any other host).
      expect(h.server.calls.every((call) => call.path.startsWith("/api/"))).toBe(true);
    }
  });

  it("connector authentication: PawOS decides whether the account may connect it, and where", async () => {
    const h = start({ signedIn: true, answers: ["/connect slack", "skip", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = connectors;
    await runCli([], h.ctx);
    const asked = h.server.calls.find((call) => call.method === "POST" && call.path === "/api/dashboard/integrations/slack");
    expect(asked).toBeDefined();
    expect(asked!.body).toEqual({}); // nothing about the plan or the account is claimed by the client
    // Slack is connected from the desktop app: PawOS's own instruction is shown.
    expect(h.output()).toContain("Open PawOS on your desktop, go to Settings → Connections and connect Slack.");
    expect(h.output()).toContain("Slack was not connected.");
  });

  it("a connector the plan doesn't include: PawOS's refusal, the plan, and where to see the options", async () => {
    const h = start({ signedIn: true, answers: ["/connect linear", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = connectors;
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("Linear isn't available for this PawOS account.");
    expect(output).toContain("Linear is available on a higher plan.");
    expect(output).toContain("Plan: Paw Pro");
    expect(output).toContain("https://pawos.test/pricing");
    expect(output).not.toContain("Open PawOS Integrations to connect Linear");
    expect(h.prompter.prompts.some((prompt) => prompt.includes("press Enter"))).toBe(false);
  });

  it("an already-connected connector is reported as it is, without starting anything", async () => {
    const h = start({ signedIn: true, answers: ["/connect GitHub", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = connectors;
    await runCli([], h.ctx);
    expect(h.output()).toContain("✓ GitHub is already connected  octocat");
    expect(h.server.calls.some((call) => call.method === "POST" && call.path.startsWith("/api/dashboard/integrations/"))).toBe(false);
  });

  it("connector failure: an unknown name, or PawOS listing nothing, is said plainly", async () => {
    const unknown = start({ signedIn: true, answers: ["/connect dropbox", "/connect", null], cwd: HOME, local: NOT_GIT });
    await runCli([], unknown.ctx);
    expect(unknown.output()).toContain("PawOS doesn't have a connection by that name.");
    expect(unknown.output()).toContain("Which one? For example: /connect github");
    expect(unknown.output()).toContain("Available: github, slack, linear");

    const down = start({ signedIn: true, answers: ["/connections", null], cwd: HOME, local: NOT_GIT });
    down.server.integrations = [];
    await runCli([], down.ctx);
    expect(down.output()).toContain("PawOS didn't list any connections.");
  });

  it("finds a connector by id or name, in any case", () => {
    expect(findIntegration(connectors, "GITHUB")?.id).toBe("github");
    expect(findIntegration(connectors, "  slack ")?.id).toBe("slack");
    expect(findIntegration(connectors, "lin")?.id).toBe("linear");
    expect(findIntegration(connectors, "")).toBeNull();
    expect(findIntegration(connectors, "nope")).toBeNull();
  });
});

describe("OAuth", () => {
  const github = () => [integration("github", "GitHub", { group: "sourceControl" })];
  const connectWhenAsked = (h: ReturnType<typeof harness>, label = "octocat") => {
    const ask = h.prompter.ask.bind(h.prompter);
    h.prompter.ask = async (prompt) => {
      if (prompt.includes("press Enter to check again")) h.server.integrations = [integration("github", "GitHub", { connection: "connected", accountLabel: label, group: "sourceControl" })];
      return ask(prompt);
    };
  };

  it("OAuth from a normal directory: PawOS's own flow is used — the user is sent to PawOS's Integrations page", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = github();
    connectWhenAsked(h);
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("  GitHub is not connected.");
    expect(output).toContain("  Open PawOS Integrations to connect GitHub.");
    expect(h.prompter.prompts).toContain("  After completing the connection, press Enter to check again (or type skip): ");
    // Nothing on screen suggests the CLI did the connecting, or that it is connected before PawOS says so.
    expect(output).not.toMatch(/PawOS needs to connect|Connecting to GitHub|Authorizing|Opening/);
    expect(output.indexOf("✓ GitHub connected")).toBeGreaterThan(output.indexOf("Open PawOS Integrations to connect GitHub."));
    expect(output.split("\n")).toContain("https://pawos.test/dashboard/integrations"); // alone on its line, easy to copy
  });

  it("OAuth completion: once PawOS reports the connection, it says so", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = github();
    connectWhenAsked(h);
    await runCli([], h.ctx);
    expect(h.output()).toContain("✓ GitHub connected  octocat");
    // It was PawOS that said so: the list was read again after the user came back.
    expect(h.server.calls.filter((call) => call.method === "GET" && call.path === "/api/dashboard/integrations").length).toBeGreaterThanOrEqual(2);
  });

  it("if the user comes back without finishing, it says the service isn't connected — it never assumes", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = github();
    await runCli([], h.ctx);
    expect(h.output()).toContain("GitHub isn't connected yet.");
    expect(h.output()).toContain("Complete the connection in PawOS, then use /connect github to check again.");
    expect(h.output()).not.toContain("✓ GitHub connected");
  });

  it("return to the interactive UI: the prompt is back straight after — no CMD fallback, no restart, no change of folder", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", "hello again", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = github();
    connectWhenAsked(h);
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output.lastIndexOf(QUESTION)).toBeGreaterThan(output.indexOf("✓ GitHub connected"));
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hello again"]); // the same session carried on
    expect(output.split("AI Developer Workspace").length - 1).toBe(1); // the workspace was not restarted
  });

  it("in a GitHub project where GitHub isn't connected, PawOS offers to connect it and then turns Code mode on", async () => {
    const h = start({ signedIn: true, answers: ["y", "", null] });
    h.server.integrations = github();
    h.server.readiness = { state: "githubNotConnected" };
    const ask = h.prompter.ask.bind(h.prompter);
    h.prompter.ask = async (prompt) => {
      if (prompt.includes("press Enter to check again")) {
        h.server.integrations = [integration("github", "GitHub", { connection: "connected", accountLabel: "octocat" })];
        h.server.readiness = { state: "ready", repository: { fullName: "acme/site", defaultBranch: "main" }, scope: "full" };
      }
      return ask(prompt);
    };
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("GitHub isn't connected to your PawOS account.");
    expect(output).toContain("✓ GitHub connected");
    expect(output).toContain("Code mode: changes go to acme/site on GitHub.");
  });

  it("no token leakage: the provider's OAuth address, its state and client id never reach the screen", async () => {
    const h = start({ signedIn: true, answers: ["/connect github", "", "/connections", "/status", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = github();
    connectWhenAsked(h);
    await runCli([], h.ctx);
    const screen = h.raw();
    for (const secret of ["SECRET_STATE", "PAWOS_CLIENT_ID", "provider.example", "oauth/authorize", "access-", "refresh-", "Bearer "]) expect(screen).not.toContain(secret);
  });

  it("the CLI runs no OAuth of its own: no client id, no secret, no callback listener, no browser launch", () => {
    for (const { file, source } of sources()) {
      expect(source).not.toMatch(/oauth\/authorize|code_challenge=|createServer\(|\.listen\(|redirect_uri/i);
      if (source.includes("child_process")) expect(file).toBe("git/localRepository.ts");
    }
  });
});
