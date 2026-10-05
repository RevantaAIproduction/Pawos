import { describe, expect, it } from "vitest";
import { DESKTOP_SIGN_IN_TTL_MS, challengeForVerifier, consumeDesktopSignIn, isValidChallenge, stashDesktopSignIn } from "./desktopSignIn";

const verifier = "v".repeat(43);
const challenge = challengeForVerifier(verifier);

describe("PawOS Desktop sign-in from the browser", () => {
  it("accepts only a base64url SHA-256 challenge", () => {
    expect(isValidChallenge(challenge)).toBe(true);
    expect(isValidChallenge("short")).toBe(false);
    expect(isValidChallenge(`${challenge}<script>`)).toBe(false);
    expect(isValidChallenge(undefined)).toBe(false);
  });

  it("hands the token to the holder of the verifier, exactly once", () => {
    const code = stashDesktopSignIn({ tokenHash: "th", email: "a@example.com", challenge });
    expect(consumeDesktopSignIn(code, verifier)).toEqual({ tokenHash: "th", email: "a@example.com" });
    expect(consumeDesktopSignIn(code, verifier)).toBeNull();
  });

  it("a wrong verifier gets nothing and burns the code", () => {
    const code = stashDesktopSignIn({ tokenHash: "th", email: "a@example.com", challenge });
    expect(consumeDesktopSignIn(code, "w".repeat(43))).toBeNull();
    expect(consumeDesktopSignIn(code, verifier)).toBeNull();
  });

  it("expires", () => {
    const now = Date.now();
    const code = stashDesktopSignIn({ tokenHash: "th", email: "a@example.com", challenge }, now);
    expect(consumeDesktopSignIn(code, verifier, now + DESKTOP_SIGN_IN_TTL_MS + 1)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(consumeDesktopSignIn(123, verifier)).toBeNull();
    expect(consumeDesktopSignIn("x", "short")).toBeNull();
  });
});
