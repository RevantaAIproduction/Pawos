import crypto from "crypto";

/**
 * All Razorpay secrets live here, server-side only, read straight from
 * process.env — never sent to the client and never referenced from
 * Electron. Mirrors the Electron app's own "Business Configuration
 * Required" discipline (src/main/billing/*): every function here reports
 * honestly when a piece of real configuration is missing rather than
 * fabricating a working checkout.
 */
export type SubscriptionTierId = "go" | "pro" | "proMax" | "team" | "enterprise";

const PLAN_ENV_VAR: Record<Exclude<SubscriptionTierId, "go">, string> = {
  pro: "RAZORPAY_PLAN_ID_PRO",
  proMax: "RAZORPAY_PLAN_ID_PROMAX",
  team: "RAZORPAY_PLAN_ID_TEAM",
  enterprise: "RAZORPAY_PLAN_ID_ENTERPRISE",
};

export function getRazorpayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function getRazorpayPlanId(tier: SubscriptionTierId): string | null {
  if (tier === "go") return null; // Paw Go is free — never goes through checkout.
  return process.env[PLAN_ENV_VAR[tier]] ?? null;
}

export function getRazorpayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
}

/** Basic Auth header for Razorpay's REST API — key_id:key_secret, base64. No SDK dependency needed for plain REST calls. */
export function razorpayAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** Verifies X-Razorpay-Signature: HMAC-SHA256 of the raw request body using the webhook secret. Must run against the raw, unparsed body — Razorpay signs bytes, not a re-serialized JSON object. */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // length mismatch or invalid encoding — never a valid signature.
  }
}
