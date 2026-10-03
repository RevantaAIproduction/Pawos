import { describe, expect, it } from "vitest";
import { normalizeGitHubProfile, validateEarlyAccessInput } from "./earlyAccess";

const VALID = {
  name: "  Ada Lovelace ",
  email: " Ada@Example.COM ",
  role: "Software Engineer",
  company: " Analytical Engines ",
  githubProfile: "",
  selectedWorkflows: ["fix-bug", "resolve-ticket"],
  customUseCase: " Ticket triage. ",
};

describe("validateEarlyAccessInput", () => {
  it("accepts a valid registration, trimming text and lowercasing the email", () => {
    const result = validateEarlyAccessInput(VALID);
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "Software Engineer",
        company: "Analytical Engines",
        githubProfile: null,
        selectedWorkflows: ["fix-bug", "resolve-ticket"],
        customUseCase: "Ticket triage.",
      },
    });
  });

  it("requires name, a valid email, a role, a use case and at least one workflow", () => {
    const result = validateEarlyAccessInput({ name: " ", email: "not-an-email", role: "", company: " ", githubProfile: "", customUseCase: " ", selectedWorkflows: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["customUseCase", "email", "name", "role", "selectedWorkflows"]);
    expect(result.errors.customUseCase).toBe("Tell us what you'd want PawOS to help you with.");
  });

  it("treats company and GitHub profile as optional, storing null when blank", () => {
    const result = validateEarlyAccessInput({ ...VALID, company: "  ", githubProfile: "" });
    expect(result.ok && result.value.company).toBeNull();
    expect(result.ok && result.value.githubProfile).toBeNull();
  });

  it("rejects a role or workflow that isn't one of the listed options", () => {
    const result = validateEarlyAccessInput({ ...VALID, role: "Astronaut", selectedWorkflows: ["fix-bug", "launch-rocket"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.role).toBeDefined();
    expect(result.errors.selectedWorkflows).toBeDefined();
  });

  it("de-duplicates repeated workflow ids", () => {
    const result = validateEarlyAccessInput({ ...VALID, selectedWorkflows: ["fix-bug", "fix-bug"] });
    expect(result.ok && result.value.selectedWorkflows).toEqual(["fix-bug"]);
  });

  it("handles a non-object body without throwing", () => {
    expect(validateEarlyAccessInput(null).ok).toBe(false);
    expect(validateEarlyAccessInput("nope").ok).toBe(false);
  });

  it("normalizes a GitHub profile and rejects one that isn't GitHub", () => {
    const ok = validateEarlyAccessInput({ ...VALID, githubProfile: "@octocat" });
    expect(ok.ok && ok.value.githubProfile).toBe("https://github.com/octocat");

    const bad = validateEarlyAccessInput({ ...VALID, githubProfile: "https://example.com/octocat" });
    expect(bad.ok).toBe(false);
  });
});

describe("normalizeGitHubProfile", () => {
  it.each([
    ["octocat", "https://github.com/octocat"],
    ["github.com/octocat/", "https://github.com/octocat"],
    ["https://www.github.com/octo-cat", "https://github.com/octo-cat"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeGitHubProfile(input)).toBe(expected);
  });

  it.each(["-octocat", "octo--cat", "octocat/repo", "javascript:alert(1)", "a".repeat(40)])("rejects %s", (input) => {
    expect(normalizeGitHubProfile(input)).toBeNull();
  });
});
