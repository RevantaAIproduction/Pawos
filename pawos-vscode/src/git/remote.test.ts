import { describe, expect, it } from "vitest";
import { githubRepositoryFromRemote, sameRepository } from "./remote";

describe("the workspace's GitHub repository, from its Git remote", () => {
  it.each([
    ["https://github.com/acme/site.git", "acme/site"],
    ["https://github.com/acme/site", "acme/site"],
    ["https://github.com/acme/site/", "acme/site"],
    ["git@github.com:acme/site.git", "acme/site"],
    ["git@github.com:acme/site", "acme/site"],
    ["ssh://git@github.com/acme/site.git", "acme/site"],
    ["ssh://git@github.com:22/acme/site.git", "acme/site"],
    ["https://someone@github.com/Acme/My.Repo-1.git", "Acme/My.Repo-1"],
    ["  https://github.com/acme/site.git  ", "acme/site"],
  ])("%s → %s", (remote, expected) => {
    expect(githubRepositoryFromRemote(remote)).toBe(expected);
  });

  it.each([
    "",
    "https://gitlab.com/acme/site.git",
    "git@bitbucket.org:acme/site.git",
    "https://github.com.evil.example/acme/site.git",
    "https://evil.example/github.com/acme/site",
    "https://github.com/acme",
    "https://github.com/acme/site/tree/main",
    "https://github.com/acme/..",
    "C:\\code\\site",
    "../site",
  ])("is not a GitHub repository: %s", (remote) => {
    expect(githubRepositoryFromRemote(remote)).toBeNull();
  });

  it("handles a folder with no remote", () => {
    expect(githubRepositoryFromRemote(undefined)).toBeNull();
    expect(githubRepositoryFromRemote(null)).toBeNull();
  });

  it("compares repository names the way GitHub does", () => {
    expect(sameRepository("Acme/Site", "acme/site")).toBe(true);
    expect(sameRepository("acme/site", "acme/app")).toBe(false);
    expect(sameRepository(null, "acme/site")).toBe(false);
    expect(sameRepository(null, null)).toBe(false);
  });
});
