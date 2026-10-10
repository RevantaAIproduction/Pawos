import * as fs from "fs";
import * as path from "path";
import { runLocalGit, type LocalGit } from "../git/localRepository";
import { toolRisk, type ToolCall, type ToolResult } from "../shared";
import { scrubOutput } from "./commands";
import { resolveInside, type Workspace } from "./workspace";

/**
 * The local tools that change the Git repository: git_add, git_commit, git_branch, git_checkout
 * and git_push. These are the ONLY way PawOS changes Git — run_command refuses every Git command
 * that isn't a plain read (local/commandPolicy.ts).
 *
 * Each is a fixed operation with typed inputs, not a command line: PawOS builds the argument list
 * itself, so there is no flag the service can add. None of them can force, rewrite history, delete
 * a branch or discard work — those operations simply don't exist here.
 *
 * Like every change, a Git operation is prepared first (nothing touched) into a plan the user can
 * read, and run only once it has been allowed. A push is put to the user every time, in every mode.
 */

export interface GitSection {
  label: string;
  lines: string[];
  /** How many more there are than are shown. */
  more?: number;
}

export interface GitPlan {
  tool: "git_add" | "git_commit" | "git_branch" | "git_checkout" | "git_push";
  /** "PawOS wants to commit:" */
  heading: string;
  /** Exactly what the operation covers: the files, the message, the branch, the remote. */
  sections: GitSection[];
  /** The question, and the word that means yes. */
  question: string;
  /** ask: always put to the user, whatever the mode (a push). auto: asked unless the user chose auto mode. */
  level: "auto" | "ask";
  /** A few words for the task's summary, once it has been done. */
  summary: string;
  run(signal?: AbortSignal): Promise<ToolResult>;
}

export type PreparedGit = { ok: true; plan: GitPlan } | { ok: false; result: ToolResult };

export interface GitEnvironment {
  signal?: AbortSignal;
  git?: LocalGit;
}

/** Files one staging step may cover, and how many of anything are shown before the question. */
export const STAGE_FILES = 300;
const SHOWN = 20;
/** A commit can run the repository's hooks and a push talks to a server: they get longer than a query. */
const MUTATION_TIMEOUT_MS = 120_000;

const failed = (call: ToolCall, reason: string): PreparedGit => ({ ok: false, result: { id: call.id, ok: false, output: reason } });
const denied = (call: ToolCall, reason: string): PreparedGit => ({ ok: false, result: { id: call.id, ok: false, denied: true, output: `Not allowed: ${reason}` } });
const question = (ask: string, yes: string) => `  ${ask} [y] ${yes}  [n] cancel\n\n  > `;
const shown = (lines: string[]): GitSection["lines"] => lines.slice(0, SHOWN);
const more = (lines: string[]) => (lines.length > SHOWN ? { more: lines.length - SHOWN } : {});

/** An address without the name and password some remotes carry in it. */
export const withoutCredentials = (text: string) => text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, (_whole, scheme: string) => scheme);

/**
 * A branch name PawOS will create or switch to: a plain name. Not a flag, not a revision
 * expression, not a path out of refs/heads.
 */
export function branchProblem(name: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(name)) return "a branch name is letters, digits, dots, dashes, underscores and slashes, and starts with a letter or digit.";
  if (name.includes("..") || name.includes("//") || name.endsWith("/") || name.endsWith(".") || name.endsWith(".lock") || name.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"))) return "that isn't a valid branch name.";
  if (/^(HEAD|FETCH_HEAD|ORIG_HEAD|MERGE_HEAD)$/.test(name)) return "that name is reserved by Git.";
  return null;
}

function result(call: ToolCall, workspace: Workspace, ok: boolean, text: string): ToolResult {
  const output = withoutCredentials(scrubOutput(text, workspace)).trim();
  return { id: call.id, ok, output: output.length > 4000 ? `${output.slice(0, 4000)}\n… (cut short)` : output };
}

/**
 * Works out exactly what a Git operation would do, without doing it. The repository must be the
 * project itself: PawOS never acts on a repository above or beside it.
 */
export async function prepareGit(call: ToolCall, workspace: Workspace, environment: GitEnvironment = {}): Promise<PreparedGit> {
  if (toolRisk(call.name) !== "git") return denied(call, "that isn't a Git tool.");
  const git = environment.git ?? runLocalGit;
  const ask = (args: string[]) => git(args, workspace.root, environment.signal);
  const text = (key: string): string => (typeof call.args[key] === "string" ? (call.args[key] as string).trim() : "");

  const top = await ask(["rev-parse", "--show-toplevel"]);
  if (!top.ok) return failed(call, "This project isn't a Git repository, or Git isn't installed.");
  let real = "";
  try {
    real = fs.realpathSync.native(top.stdout.trim());
  } catch {
    // Falls through to the refusal below.
  }
  if (path.relative(real, workspace.root) !== "") return denied(call, "the Git repository here is not this project's own.");
  const head = await ask(["symbolic-ref", "--short", "-q", "HEAD"]);
  const branch = head.ok ? head.stdout.trim() : "";

  switch (call.name) {
    case "git_add": {
      const asked = Array.isArray(call.args.paths) ? call.args.paths : [];
      if (asked.length === 0) return failed(call, "Name the files or folders to stage.");
      const wanted: string[] = [];
      for (const given of asked) {
        const where = resolveInside(workspace, given);
        if (!where.ok) return denied(call, where.reason);
        wanted.push(where.relative === "" ? "." : where.relative);
      }
      // What staging those paths would really cover: every changed, new and removed file under them
      // that Git doesn't ignore. Each is then checked on its own, so a folder can't carry a secret in.
      const listed = await ask(["ls-files", "--modified", "--others", "--deleted", "--exclude-standard", "-z", "--", ...wanted]);
      if (!listed.ok) return failed(call, listed.reason);
      const changed = [...new Set(listed.stdout.split("\0").filter(Boolean))].sort();
      const files = changed.filter((file) => resolveInside(workspace, file).ok);
      const hidden = changed.length - files.length;
      if (files.length === 0) return failed(call, hidden > 0 ? "The only changes there are in protected files, which PawOS doesn't stage." : "There is nothing to stage there.");
      if (files.length > STAGE_FILES) return failed(call, `That would stage ${files.length.toLocaleString("en-US")} files. Name a smaller set (up to ${STAGE_FILES}).`);
      return {
        ok: true,
        plan: {
          tool: "git_add",
          heading: "PawOS wants to stage:",
          sections: [{ label: "Files", lines: shown(files), ...more(files) }, ...(hidden > 0 ? [{ label: "Left out", lines: [`${hidden} protected ${hidden === 1 ? "file" : "files"}`] }] : [])],
          question: question("Allow staging?", "stage"),
          level: "auto",
          summary: `Staged ${files.length === 1 ? files[0] : `${files.length} files`}`,
          run: async (signal) => {
            const added = await git(["add", "--", ...files], workspace.root, signal, MUTATION_TIMEOUT_MS);
            return added.ok ? result(call, workspace, true, `Staged ${files.length} ${files.length === 1 ? "file" : "files"}:\n${files.slice(0, 100).join("\n")}`) : result(call, workspace, false, `Staging failed. ${added.detail ?? added.reason}`);
          },
        },
      };
    }

    case "git_commit": {
      const message = typeof call.args.message === "string" ? call.args.message.replace(/\r\n/g, "\n").trim() : "";
      if (!message) return failed(call, "A commit needs a message.");
      // eslint-disable-next-line no-control-regex
      if (/[^\P{Cc}\n\t]/u.test(message)) return failed(call, "The commit message contains control characters.");
      const staged = await ask(["diff", "--cached", "--name-only", "-z"]);
      if (!staged.ok) return failed(call, staged.reason);
      const files = staged.stdout.split("\0").filter(Boolean);
      if (files.length === 0) return failed(call, "Nothing is staged, so there is nothing to commit. Stage the files first (git_add).");
      const secret = files.filter((file) => !resolveInside(workspace, file).ok);
      if (secret.length > 0) return denied(call, `the staged changes include ${secret.length === 1 ? "a protected file" : "protected files"} (${secret.slice(0, 3).join(", ")}). PawOS won't commit them; unstage them first.`);
      const title = message.split("\n")[0]!;
      return {
        ok: true,
        plan: {
          tool: "git_commit",
          heading: "PawOS wants to commit:",
          sections: [...(branch ? [{ label: "Branch", lines: [branch] }] : []), { label: "Files", lines: shown(files), ...more(files) }, { label: "Message", lines: message.split("\n").slice(0, 12) }],
          question: question("Allow this commit?", "commit"),
          level: "auto",
          summary: `Committed: ${title.slice(0, 120)}`,
          run: async (signal) => {
            // The message is one argument, given as it is: nothing in it is a flag or a command.
            const committed = await git(["commit", "-m", message], workspace.root, signal, MUTATION_TIMEOUT_MS);
            if (!committed.ok) return result(call, workspace, false, `The commit was not made. ${committed.detail ?? committed.reason}`);
            const made = await git(["rev-parse", "--short", "HEAD"], workspace.root, signal);
            return result(call, workspace, true, `Committed ${made.ok ? made.stdout.trim() : ""}${branch ? ` on ${branch}` : ""}: ${title} (${files.length} ${files.length === 1 ? "file" : "files"}). It has not been pushed.`);
          },
        },
      };
    }

    case "git_branch": {
      const name = text("name");
      const problem = branchProblem(name);
      if (problem) return denied(call, problem);
      if ((await ask(["show-ref", "--verify", "--quiet", `refs/heads/${name}`])).ok) return failed(call, `A branch called ${name} already exists.`);
      return {
        ok: true,
        plan: {
          tool: "git_branch",
          heading: "PawOS wants to create a branch:",
          sections: [{ label: "Branch", lines: [name] }, { label: "From", lines: [branch || "the current commit"] }],
          question: question("Allow this branch?", "create"),
          level: "auto",
          summary: `Created branch ${name}`,
          run: async (signal) => {
            const made = await git(["branch", name], workspace.root, signal, MUTATION_TIMEOUT_MS);
            return made.ok ? result(call, workspace, true, `Created the branch ${name}${branch ? ` from ${branch}` : ""}. You are still on ${branch || "the same commit"}.`) : result(call, workspace, false, `The branch was not created. ${made.detail ?? made.reason}`);
          },
        },
      };
    }

    case "git_checkout": {
      const name = text("branch");
      const problem = branchProblem(name);
      if (problem) return denied(call, problem);
      const create = call.args.create === true;
      const exists = (await ask(["show-ref", "--verify", "--quiet", `refs/heads/${name}`])).ok;
      if (create && exists) return failed(call, `A branch called ${name} already exists. Switch to it without create.`);
      if (!create && !exists) return failed(call, `There is no local branch called ${name}. Use create to make it.`);
      if (name === branch) return failed(call, `You are already on ${name}.`);
      return {
        ok: true,
        plan: {
          tool: "git_checkout",
          heading: create ? "PawOS wants to create a branch and switch to it:" : "PawOS wants to switch branch:",
          sections: [{ label: "From", lines: [branch || "the current commit"] }, { label: "To", lines: [create ? `${name} (new)` : name] }, { label: "Your uncommitted changes", lines: ["They come along. Git refuses the switch if it would overwrite any of them; PawOS never forces it."] }],
          question: question("Allow the switch?", "switch"),
          level: "auto",
          summary: `Switched to ${create ? "new branch " : ""}${name}`,
          run: async (signal) => {
            // Never forced: if the switch would overwrite local changes, Git refuses and nothing is lost.
            const switched = await git(["switch", ...(create ? ["-c"] : []), name], workspace.root, signal, MUTATION_TIMEOUT_MS);
            return switched.ok ? result(call, workspace, true, `Switched to ${create ? "the new branch " : ""}${name}.`) : result(call, workspace, false, `The switch was not made, and nothing was changed. ${switched.detail ?? switched.reason}`);
          },
        },
      };
    }

    case "git_push": {
      if (!branch) return failed(call, "There is no branch checked out (detached HEAD), so there is nothing to push.");
      const remotes = await ask(["remote"]);
      const names = remotes.ok ? remotes.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean) : [];
      if (names.length === 0) return failed(call, "This repository has no remote to push to.");
      const configured = await ask(["config", "--get", `branch.${branch}.remote`]);
      const remote = text("remote") || (configured.ok && configured.stdout.trim()) || (names.includes("origin") ? "origin" : names[0]!);
      // Only a remote the repository already has, by its name: never an address the service supplies.
      if (!names.includes(remote)) return denied(call, `this repository has no remote called ${remote.slice(0, 60)}.`);
      const url = await ask(["remote", "get-url", "--push", remote]);
      const upstream = await ask(["rev-parse", "--abbrev-ref", "--symbolic-full-name", `${branch}@{upstream}`]);
      const tracked = upstream.ok && upstream.stdout.trim().startsWith(`${remote}/`);
      const ahead = tracked ? await ask(["log", "--oneline", "-n", "50", `${upstream.stdout.trim()}..${branch}`]) : await ask(["log", "--oneline", "-n", "50", branch, "--not", `--remotes=${remote}`]);
      const commits = ahead.ok ? ahead.stdout.split(/\r?\n/).filter(Boolean) : [];
      return {
        ok: true,
        plan: {
          tool: "git_push",
          heading: "PawOS wants to push:",
          sections: [
            { label: "Branch", lines: [tracked ? branch : `${branch} (new on ${remote})`] },
            { label: "Remote", lines: [url.ok && url.stdout.trim() ? `${remote}  ${withoutCredentials(url.stdout.trim())}` : remote] },
            { label: "Commits", lines: commits.length > 0 ? shown(commits) : ["(none that the remote doesn't already have)"], ...more(commits) },
          ],
          question: question("Allow push?", "push"),
          // A push leaves this computer. It is asked about every time, in every mode.
          level: "ask",
          summary: `Pushed ${branch} to ${remote}`,
          run: async (signal) => {
            // A plain push of this one branch. No force, no tags, no other branches.
            const pushed = await git(["push", ...(tracked ? [] : ["--set-upstream"]), remote, `refs/heads/${branch}:refs/heads/${branch}`], workspace.root, signal, MUTATION_TIMEOUT_MS);
            return pushed.ok ? result(call, workspace, true, `Pushed ${branch} to ${remote} (${commits.length} ${commits.length === 1 ? "commit" : "commits"}).`) : result(call, workspace, false, `The push did not go through. ${pushed.detail ?? pushed.reason}`);
          },
        },
      };
    }

    default:
      return denied(call, "that isn't a Git tool.");
  }
}
