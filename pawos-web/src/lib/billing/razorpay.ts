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

/**
 * Ticket Balance — a dollar-denominated wallet, completely independent of subscription pricing.
 * Mirrors TICKET_PRICING_TIERS / getTicketUnitPriceUsd / MIN_TICKET_BALANCE_TOPUP_USD /
 * TICKET_BALANCE_TOPUP_PRESETS_USD in src/shared/organization/AutonomousTaskBillingTypes.ts —
 * kept in sync manually since pawos-web is a separate deployment with no shared build step. This
 * file only ever validates/labels a top-up amount; the actual per-ticket rate is applied by the
 * Electron app's own get_ticket_unit_price() SQL function at ticket-completion time, never here.
 */
export interface TicketPricingTier {
  minTicketNumber: number;
  maxTicketNumber: number | null;
  pricePerTicketUsd: number;
}

export const TICKET_PRICING_TIERS: readonly TicketPricingTier[] = [
  { minTicketNumber: 1, maxTicketNumber: 500, pricePerTicketUsd: 5.0 },
  { minTicketNumber: 501, maxTicketNumber: 2000, pricePerTicketUsd: 4.5 },
  { minTicketNumber: 2001, maxTicketNumber: 10000, pricePerTicketUsd: 4.0 },
  { minTicketNumber: 10001, maxTicketNumber: 25000, pricePerTicketUsd: 3.5 },
  { minTicketNumber: 25001, maxTicketNumber: null, pricePerTicketUsd: 3.0 },
];

/** Real, finalized minimum top-up: a balance top-up must be at least $30. Code default — see getTicketPricingConfig() for the real, editable value. */
export const MIN_TICKET_BALANCE_TOPUP_USD = 30;
/** Preset top-up amounts shown in the UI — not exhaustive, a custom amount at or above the minimum is always accepted. Code default — see getTicketPricingConfig(). */
export const TICKET_BALANCE_TOPUP_PRESETS_USD: readonly number[] = [30, 60, 100, 150, 200];

/**
 * Editable Ticket Balance top-up configuration, mirroring the Electron app's own
 * TicketPricingConfigStore.ts — new preset amounts (e.g. a future $500 option) or a revised
 * minimum can be added later purely via env vars, no code change or redeploy of application logic
 * required. TICKET_BALANCE_TOPUP_PRESETS/TICKET_BALANCE_MIN_TOPUP_USD are optional; both fall back
 * to the code defaults above when unset.
 */
export function getTicketPricingConfig(): { topupPresetsUsd: number[]; minTopupUsd: number } {
  const presetsEnv = process.env.TICKET_BALANCE_TOPUP_PRESETS;
  const parsedPresets = presetsEnv
    ? presetsEnv.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const minEnv = Number(process.env.TICKET_BALANCE_MIN_TOPUP_USD);
  return {
    topupPresetsUsd: parsedPresets.length > 0 ? parsedPresets : [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: Number.isFinite(minEnv) && minEnv > 0 ? minEnv : MIN_TICKET_BALANCE_TOPUP_USD,
  };
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

/**
 * P0-2 security fix. Verifies the client-side Checkout.js "payment succeeded" signature for a
 * one-time Order (razorpay_order_id + razorpay_payment_id + razorpay_signature) — the standard
 * Razorpay Orders-API integration check, documented at
 * https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/#step-5-verify-payment-signature
 * Only Razorpay's own backend can produce a signature that verifies against key_secret, so a valid
 * result here is real cryptographic proof this exact (order_id, payment_id) pair was genuinely
 * processed by Razorpay — it cannot be forged by a client that doesn't hold key_secret.
 */
export function verifyRazorpayOrderPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Fetches a payment from Razorpay's own API — used to re-derive the REAL captured amount/status/order linkage server-side rather than ever trusting a client-supplied amount. */
export async function fetchRazorpayPayment(
  paymentId: string,
  credentials: { keyId: string; keySecret: string }
): Promise<{ id: string; order_id: string | null; status: string; amount: number; currency: string } | null> {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * P0-3 security fix. Verifies the Checkout.js "subscription payment succeeded" signature —
 * Razorpay's documented subscription integration check: HMAC-SHA256 of
 * `${razorpay_payment_id}|${razorpay_subscription_id}` using key_secret. Only Razorpay's own
 * backend can produce a signature that verifies against key_secret, so this is real cryptographic
 * proof this exact (payment_id, subscription_id) pair was genuinely processed by Razorpay — never
 * forgeable by a caller that doesn't hold key_secret (which the Electron app never does).
 */
export function verifyRazorpaySubscriptionPaymentSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string
): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Fetches a subscription from Razorpay's own API — used to re-derive the REAL plan/status/seat-count server-side rather than ever trusting a client-supplied tier. */
export async function fetchRazorpaySubscription(
  subscriptionId: string,
  credentials: { keyId: string; keySecret: string }
): Promise<{ id: string; plan_id: string; status: string; quantity?: number; notes?: Record<string, string> } | null> {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  return response.json();
}

/** Reverses getRazorpayPlanId() — given a real plan_id read back from Razorpay, finds which (tier, seatTier) it actually corresponds to. Returns null for a plan_id that matches no configured plan (never guesses). */
export function resolveTierFromRazorpayPlanId(planId: string): { tier: SubscriptionTierId; seatTier?: SeatTier } | null {
  for (const tier of ["pro", "proMax"] as const) {
    if (process.env[FLAT_PLAN_ENV_VAR[tier]] === planId) return { tier };
  }
  for (const seatTier of ["standard", "premium"] as const) {
    if (process.env[TEAM_SEAT_PLAN_ENV_VAR[seatTier]] === planId) return { tier: "team", seatTier };
  }
  if (process.env[ENTERPRISE_BASE_PLAN_ENV_VAR] === planId) return { tier: "enterprise" };
  return null;
}
