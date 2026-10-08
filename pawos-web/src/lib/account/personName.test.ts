import { describe, expect, it } from "vitest";
import { accountDisplayName, accountPersonName } from "./accountContext";

/** The name PawOS's clients greet the account holder by (GET /api/web/capabilities → user.name). */
describe("accountPersonName", () => {
  it("is the name on the sign-in profile", () => {
    expect(accountPersonName({ user_metadata: { full_name: "Tharun Esta" } })).toBe("Tharun Esta");
    expect(accountPersonName({ user_metadata: { name: "  Ada   Lovelace " } })).toBe("Ada Lovelace");
    expect(accountPersonName({ user_metadata: { full_name: "", name: "Ada" } })).toBe("Ada");
  });

  it("is null when there is no name — it never falls back to a login or an email address", () => {
    const user = { email: "private@example.com", user_metadata: { user_name: "octocat" } };
    expect(accountDisplayName(user)).toBe("octocat"); // the display name does fall back
    expect(accountPersonName(user)).toBeNull();
    expect(accountPersonName({ user_metadata: {} })).toBeNull();
    expect(accountPersonName({ user_metadata: null as never })).toBeNull();
  });

  it("never returns an email address or an unreasonable value, whatever the profile holds", () => {
    expect(accountPersonName({ user_metadata: { full_name: "private@example.com" } })).toBeNull();
    expect(accountPersonName({ user_metadata: { full_name: "private@example.com", name: "Ada" } })).toBe("Ada");
    expect(accountPersonName({ user_metadata: { full_name: "x".repeat(81) } })).toBeNull();
    expect(accountPersonName({ user_metadata: { full_name: 42, name: { first: "Ada" } } })).toBeNull();
  });
});
