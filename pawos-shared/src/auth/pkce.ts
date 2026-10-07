import { createHash, randomBytes } from "crypto";

/** A PKCE pair (RFC 7636, S256): the verifier stays in this extension; only the challenge leaves it. */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkcePair(random: (size: number) => Buffer = randomBytes): PkcePair {
  const verifier = random(48).toString("base64url"); // 64 characters, within RFC 7636's 43–128
  return { verifier, challenge: challengeFor(verifier) };
}
