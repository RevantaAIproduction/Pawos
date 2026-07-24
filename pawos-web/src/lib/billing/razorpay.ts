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

/** Only meaningful for Team — Standard/Premium seat rate. Enterprise seats are uniform. */
export type SeatTier = "standard" | "premium";

const FLAT_PLAN_ENV_VAR: Record<"pro" | "proMax", string> = {
  pro: "RAZORPAY_PLAN_ID_PRO",
  proMax: "RAZORPAY_PLAN_ID_PROMAX",
};

/** Team can mix seat tiers across members, so each rate needs its own Razorpay plan (and, at checkout time, its own subscription — a single Razorpay subscription can't mix per-unit prices). */
const TEAM_SEAT_PLAN_ENV_VAR: Record<SeatTier, string> = {
  standard: "RAZORPAY_PLAN_ID_TEAM_STANDARD",
  premium: "RAZORPAY_PLAN_ID_TEAM_PREMIUM",
};

/** Enterprise's only Razorpay-billed component is the seat base fee — its variable cost (Autonomous Engineering Task usage) is billed separately through the existing success-gated usage system, not through a Razorpay plan. */
const ENTERPRISE_BASE_PLAN_ENV_VAR = "RAZORPAY_PLAN_ID_ENTERPRISE_BASE";

export function getRazorpayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** `seatTier` is required for tier === "team" (no ambiguous default plan); ignored for every other tier. */
export function getRazorpayPlanId(tier: SubscriptionTierId, seatTier?: SeatTier): string | null {
  if (tier === "go") return null; // Paw Go is free — never goes through checkout.
  if (tier === "pro" || tier === "proMax") return process.env[FLAT_PLAN_ENV_VAR[tier]] ?? null;
  if (tier === "team") {
    if (!seatTier) return null;
    return process.env[TEAM_SEAT_PLAN_ENV_VAR[seatTier]] ?? null;
  }
  return process.env[ENTERPRISE_BASE_PLAN_ENV_VAR] ?? null;
}

/** Real, finalized price: $5 per Autonomous Engineering Task credit. Mirrors src/shared/organization/AutonomousTaskBillingTypes.ts's AUTONOMOUS_TASK_PRICE_USD in the Electron app — kept in sync manually since pawos-web is a separate deployment with no shared build step. */
export const TASK_CREDIT_PRICE_USD = 5;
/** Real, finalized minimum: every credit purchase (first and subsequent) must be at least 6 credits ($30). */
export const MIN_TASK_CREDIT_PURCHASE = 6;

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
