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
export type ProMaxVariant = "5x" | "20x";
/** Pro is sold monthly or yearly (two Razorpay plans); every other plan is monthly. */
export type BillingFrequency = "monthly" | "yearly";


/** Only meaningful for Team — Standard/Premium seat rate. Enterprise seats are uniform. */
export type SeatTier = "standard" | "premium";

export type PaymentMethodId = "upi" | "card" | "netbanking" | "wallet";

const VALID_PAYMENT_METHODS: readonly PaymentMethodId[] = ["upi", "card", "netbanking", "wallet"];

/**
 * The env var names each Razorpay plan id may be stored under — the first one that is set wins.
 * Both naming styles are accepted: RAZORPAY_PLAN_ID_* (.env.example) and the RAZORPAY_*_ID names
 * the live PawOS environment already uses (RAZORPAY_PRO_ID, Razorpay_Pro_Yearly_ID, …).
 * Team can mix seat tiers across members, so each seat rate has its own plan. Enterprise's only
 * Razorpay-billed component is the seat base fee (its variable cost is billed separately).
 */
type PlanKey = "proMonthly" | "proYearly" | "proMax5x" | "proMax20x" | "teamStandard" | "teamPremium" | "enterpriseBase";
const PLAN_ENV_NAMES: Record<PlanKey, readonly string[]> = {
  proMonthly: ["RAZORPAY_PLAN_ID_PRO", "RAZORPAY_PRO_ID", "RAZORPAY_PRO_MONTHLY_ID"],
  proYearly: ["RAZORPAY_PLAN_ID_PRO_YEARLY", "RAZORPAY_PRO_YEARLY_ID", "Razorpay_Pro_Yearly_ID"],
  proMax5x: ["RAZORPAY_PLAN_ID_PROMAX_5X", "RAZORPAY_PRO_MAX_5X_ID", "RAZORPAY_PRO_MAX_ID", "RAZORPAY_PLAN_ID_PROMAX"],
  proMax20x: ["RAZORPAY_PLAN_ID_PROMAX_20X", "RAZORPAY_PRO_MAX_20X_ID"],
  teamStandard: ["RAZORPAY_PLAN_ID_TEAM_STANDARD", "RAZORPAY_TEAM_STANDARD_ID"],
  teamPremium: ["RAZORPAY_PLAN_ID_TEAM_PREMIUM", "RAZORPAY_TEAM_PREMIUM_ID"],
  enterpriseBase: ["RAZORPAY_PLAN_ID_ENTERPRISE_BASE", "RAZORPAY_ENTERPRISE_BASE_ID"],
};

/** The configured Razorpay plan id for one plan (quotes and whitespace trimmed), or null. */
function planIdFor(key: PlanKey): string | null {
  for (const name of PLAN_ENV_NAMES[key]) {
    const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return null;
}

export function getRazorpayCredentials(): { keyId: string; keySecret: string } | null {
  let keyId = process.env.RAZORPAY_KEY_ID?.trim();
  let keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  // Remove quotes if present (from .env files with quoted values)
  if (keyId?.startsWith('"') && keyId?.endsWith('"')) keyId = keyId.slice(1, -1);
  if (keySecret?.startsWith('"') && keySecret?.endsWith('"')) keySecret = keySecret.slice(1, -1);
  if (keyId?.startsWith("'") && keyId?.endsWith("'")) keyId = keyId.slice(1, -1);
  if (keySecret?.startsWith("'") && keySecret?.endsWith("'")) keySecret = keySecret.slice(1, -1);

  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function getConfiguredPaymentMethods(): PaymentMethodId[] {
  const configured = process.env.RAZORPAY_ENABLED_METHODS;
  if (!configured) return [];
  const valid = new Set<string>(VALID_PAYMENT_METHODS);
  return configured
    .split(",")
    .map((method) => method.trim().toLowerCase())
    .filter((method, index, list): method is PaymentMethodId => valid.has(method) && list.indexOf(method) === index);
}

/** `seatTier` is required for tier === "team" (no ambiguous default plan); `proMaxVariant` required for tier === "proMax"; `billingFrequency` only matters for Pro. */
export function getRazorpayPlanId(tier: SubscriptionTierId, seatTier?: SeatTier, proMaxVariant?: ProMaxVariant, billingFrequency: BillingFrequency = "monthly"): string | null {
  if (tier === "go") return null; // Paw Go is free — never goes through checkout.
  if (tier === "pro") return planIdFor(billingFrequency === "yearly" ? "proYearly" : "proMonthly");
  if (tier === "proMax") {
    if (!proMaxVariant) return null; // proMaxVariant is required for Pro Max
    return planIdFor(proMaxVariant === "20x" ? "proMax20x" : "proMax5x");
  }
  if (tier === "team") {
    if (!seatTier) return null;
    return planIdFor(seatTier === "premium" ? "teamPremium" : "teamStandard");
  }
  return planIdFor("enterpriseBase");
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
/** Real, finalized maximum top-up: a single balance top-up must be at most $20,000. Code default — see getTicketPricingConfig() for the real, editable value. Mirrors the same $20,000 ceiling enforced independently, as defense-in-depth, inside add_ticket_balance_service() at the SQL layer. */
export const MAX_TICKET_BALANCE_TOPUP_USD = 20000;
/** Preset top-up amounts shown in the UI — not exhaustive, a custom amount at or above the minimum is always accepted. Code default — see getTicketPricingConfig(). */
export const TICKET_BALANCE_TOPUP_PRESETS_USD: readonly number[] = [30, 60, 100, 150, 200];
/** Current configured INR payment conversion for India Razorpay Orders. PawOS ledgers remain USD. */
export const DEFAULT_TICKET_BALANCE_USD_INR_RATE = 95.65;

/**
 * Editable Ticket Balance top-up configuration, mirroring the Electron app's own
 * TicketPricingConfigStore.ts — new preset amounts (e.g. a future $500 option) or a revised
 * minimum/maximum can be added later purely via env vars, no code change or redeploy of application
 * logic required. TICKET_BALANCE_TOPUP_PRESETS/TICKET_BALANCE_MIN_TOPUP_USD/
 * TICKET_BALANCE_MAX_TOPUP_USD are optional; all fall back to the code defaults above when unset.
 *
 * This is the SINGLE source of truth for the min/max top-up policy within pawos-web — both
 * /api/billing/checkout-credits and /api/billing/credit-ticket-balance read this function rather
 * than each hardcoding their own copy of the bounds.
 */
export function getTicketPricingConfig(): { topupPresetsUsd: number[]; minTopupUsd: number; maxTopupUsd: number } {
  const presetsEnv = process.env.TICKET_BALANCE_TOPUP_PRESETS;
  const parsedPresets = presetsEnv
    ? presetsEnv.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const minEnv = Number(process.env.TICKET_BALANCE_MIN_TOPUP_USD);
  const maxEnv = Number(process.env.TICKET_BALANCE_MAX_TOPUP_USD);
  return {
    topupPresetsUsd: parsedPresets.length > 0 ? parsedPresets : [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: Number.isFinite(minEnv) && minEnv > 0 ? minEnv : MIN_TICKET_BALANCE_TOPUP_USD,
    maxTopupUsd: Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : MAX_TICKET_BALANCE_TOPUP_USD,
  };
}

export function getTicketBalanceUsdInrRate(): number {
  const configured = Number(process.env.TICKET_BALANCE_USD_INR_RATE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TICKET_BALANCE_USD_INR_RATE;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (/e/i.test(text)) return 99;
  const [, fraction = ""] = text.split(".");
  return fraction.length;
}

export function usdAmountToCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || decimalPlaces(value) > 2) return null;
  const cents = Math.round(value * 100);
  return Math.abs(cents / 100 - value) < 0.0000001 ? cents : null;
}

function rateToPaisePerUsd(rate: number): number {
  return Math.round(rate * 100);
}

export function calculateTicketBalanceInrPayment(amountUsd: number): {
  amountUsd: number;
  usdCents: number;
  usdInrRate: number;
  amountPaise: number;
  amountInr: number;
} | null {
  const usdCents = usdAmountToCents(amountUsd);
  if (usdCents === null) return null;
  const usdInrRate = getTicketBalanceUsdInrRate();
  const amountPaise = Math.round((usdCents * rateToPaisePerUsd(usdInrRate)) / 100);
  return {
    amountUsd: usdCents / 100,
    usdCents,
    usdInrRate,
    amountPaise,
    amountInr: amountPaise / 100,
  };
}

export function buildTicketBalanceOrderPayload(params: {
  amountUsd: number;
  userId: string;
  organizationId?: string;
}):
  | {
      ok: true;
      amountUsd: number;
      usdInrRate: number;
      amountInr: number;
      amountPaise: number;
      payload: { amount: number; currency: "INR"; notes: Record<string, string> };
    }
  | { ok: false; reason: string } {
  const conversion = calculateTicketBalanceInrPayment(params.amountUsd);
  if (!conversion) return { ok: false, reason: "Enter a valid USD amount with at most two decimal places." };

  const { minTopupUsd, maxTopupUsd } = getTicketPricingConfig();
  if (conversion.amountUsd < minTopupUsd) return { ok: false, reason: `Minimum top-up is $${minTopupUsd}.` };
  if (conversion.amountUsd > maxTopupUsd) return { ok: false, reason: `Maximum top-up is $${maxTopupUsd.toLocaleString()}.` };

  return {
    ok: true,
    amountUsd: conversion.amountUsd,
    usdInrRate: conversion.usdInrRate,
    amountInr: conversion.amountInr,
    amountPaise: conversion.amountPaise,
    payload: {
      amount: conversion.amountPaise,
      currency: "INR",
      notes: {
        productType: "ticket_balance",
        amountUsd: conversion.amountUsd.toFixed(2),
        usdInrRate: String(conversion.usdInrRate),
        amountInr: conversion.amountInr.toFixed(2),
        amountPaise: String(conversion.amountPaise),
        currency: "INR",
        organizationId: params.organizationId ?? "",
        userId: params.userId,
      },
    },
  };
}

// ─── Usage Credits (normal Paw Compute top-ups) ──────────────────────────────
// Separate product from Autonomous Work Credits — different minimum, different ledger (add_usage_credits_service RPC).

/** Real, finalized minimum top-up: a Usage Credits top-up must be at least $5. */
export const MIN_USAGE_CREDITS_TOPUP_USD = 5;
/** Real, finalized maximum top-up: a single Usage Credits top-up must be at most $20,000. */
export const MAX_USAGE_CREDITS_TOPUP_USD = 20000;
/** Preset top-up amounts shown in the UI for Usage Credits. */
export const USAGE_CREDITS_TOPUP_PRESETS_USD: readonly number[] = [5, 10, 30, 50, 100];

/** Editable Usage Credits top-up configuration — same pattern as getTicketPricingConfig() but for the usage wallet. */
export function getUsageCreditsPricingConfig(): { topupPresetsUsd: number[]; minTopupUsd: number; maxTopupUsd: number } {
  const presetsEnv = process.env.USAGE_CREDITS_TOPUP_PRESETS;
  const parsedPresets = presetsEnv
    ? presetsEnv.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const minEnv = Number(process.env.USAGE_CREDITS_MIN_TOPUP_USD);
  const maxEnv = Number(process.env.USAGE_CREDITS_MAX_TOPUP_USD);
  return {
    topupPresetsUsd: parsedPresets.length > 0 ? parsedPresets : [...USAGE_CREDITS_TOPUP_PRESETS_USD],
    minTopupUsd: Number.isFinite(minEnv) && minEnv > 0 ? minEnv : MIN_USAGE_CREDITS_TOPUP_USD,
    maxTopupUsd: Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : MAX_USAGE_CREDITS_TOPUP_USD,
  };
}

/**
 * Builds a Razorpay Order payload for a Usage Credits top-up.
 * Stamps `productType: "usage_credits"` in notes — the server-authoritative product classification
 * that the webhook and credit-usage-credits route use to route to the correct ledger (add_usage_credits_service).
 * The renderer cannot change productType after order creation.
 */
export function buildUsageCreditsOrderPayload(params: {
  amountUsd: number;
  userId: string;
  organizationId?: string;
}):
  | {
      ok: true;
      amountUsd: number;
      usdInrRate: number;
      amountInr: number;
      amountPaise: number;
      payload: { amount: number; currency: "INR"; notes: Record<string, string> };
    }
  | { ok: false; reason: string } {
  const conversion = calculateTicketBalanceInrPayment(params.amountUsd); // reuses the same INR conversion (same rate)
  if (!conversion) return { ok: false, reason: "Enter a valid USD amount with at most two decimal places." };

  const { minTopupUsd, maxTopupUsd } = getUsageCreditsPricingConfig();
  if (conversion.amountUsd < minTopupUsd) return { ok: false, reason: `Minimum top-up is $${minTopupUsd}.` };
  if (conversion.amountUsd > maxTopupUsd) return { ok: false, reason: `Maximum top-up is $${maxTopupUsd.toLocaleString()}.` };

  return {
    ok: true,
    amountUsd: conversion.amountUsd,
    usdInrRate: conversion.usdInrRate,
    amountInr: conversion.amountInr,
    amountPaise: conversion.amountPaise,
    payload: {
      amount: conversion.amountPaise,
      currency: "INR",
      notes: {
        productType: "usage_credits",
        amountUsd: conversion.amountUsd.toFixed(2),
        usdInrRate: String(conversion.usdInrRate),
        amountInr: conversion.amountInr.toFixed(2),
        amountPaise: String(conversion.amountPaise),
        currency: "INR",
        organizationId: params.organizationId ?? "",
        userId: params.userId,
      },
    },
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
 * Fetches a one-time-payment Order from Razorpay's own API — used to independently re-derive the
 * order's own `notes` (amountUsd, organizationId, userId) server-side. This is the ONLY mechanism
 * available to resolve "who does this payment belong to" from a bare payment/order id with no
 * bearer access token in hand — in particular, the webhook handler has no user session to check
 * against, so it must read identity from the order's own notes, exactly as set at order-creation
 * time in /api/billing/checkout-credits.
 */
export async function fetchRazorpayOrder(
  orderId: string,
  credentials: { keyId: string; keySecret: string }
): Promise<{ id: string; amount: number; currency: string; status: string; notes: Record<string, string> } | null> {
  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
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

/** The Razorpay subscription fields PawOS reads (see Razorpay's Subscriptions API). Times are Unix seconds. */
export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  quantity?: number;
  notes?: Record<string, string>;
  /** End of the currently paid billing cycle. */
  current_end?: number | null;
  /** Next scheduled charge. */
  charge_at?: number | null;
};

/** Fetches a subscription from Razorpay's own API — used to re-derive the REAL plan/status/seat-count server-side rather than ever trusting a client-supplied tier. */
export async function fetchRazorpaySubscription(
  subscriptionId: string,
  credentials: { keyId: string; keySecret: string }
): Promise<RazorpaySubscription | null> {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  return response.json();
}

/** One page of the account's Razorpay subscriptions, newest first (Razorpay caps `count` at 100). */
export async function listRazorpaySubscriptions(
  credentials: { keyId: string; keySecret: string },
  page: { count: number; skip: number }
): Promise<RazorpaySubscription[] | null> {
  const query = new URLSearchParams({ count: String(Math.min(Math.max(page.count, 1), 100)), skip: String(Math.max(page.skip, 0)) });
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions?${query}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { items?: RazorpaySubscription[] } | null;
  return Array.isArray(body?.items) ? body.items : null;
}

/** Reverses getRazorpayPlanId() — given a real plan_id read back from Razorpay, finds which (tier, seatTier, proMaxVariant) it actually corresponds to. Returns null for a plan_id that matches no configured plan (never guesses). */
export function resolveTierFromRazorpayPlanId(planId: string): { tier: SubscriptionTierId; seatTier?: SeatTier; proMaxVariant?: ProMaxVariant; billingFrequency?: BillingFrequency } | null {
  if (!planId) return null;
  if (planIdFor("proMonthly") === planId) return { tier: "pro", billingFrequency: "monthly" };
  if (planIdFor("proYearly") === planId) return { tier: "pro", billingFrequency: "yearly" };
  if (planIdFor("proMax5x") === planId) return { tier: "proMax", proMaxVariant: "5x", billingFrequency: "monthly" };
  if (planIdFor("proMax20x") === planId) return { tier: "proMax", proMaxVariant: "20x", billingFrequency: "monthly" };
  if (planIdFor("teamStandard") === planId) return { tier: "team", seatTier: "standard" };
  if (planIdFor("teamPremium") === planId) return { tier: "team", seatTier: "premium" };
  if (planIdFor("enterpriseBase") === planId) return { tier: "enterprise" };
  return null;
}

/** The fields of a Razorpay invoice the account's Invoices list shows. Amounts are in the smallest unit (paise). */
export type RazorpayInvoice = {
  id: string;
  subscription_id?: string | null;
  status: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  date?: number | null;
  issued_at?: number | null;
  paid_at?: number | null;
  short_url?: string | null;
};

/** Every invoice Razorpay generated for one subscription (one per billing cycle). Null when Razorpay can't be read. */
export async function listRazorpayInvoices(
  credentials: { keyId: string; keySecret: string },
  subscriptionId: string
): Promise<RazorpayInvoice[] | null> {
  const query = new URLSearchParams({ subscription_id: subscriptionId, count: "100" });
  const response = await fetch(`https://api.razorpay.com/v1/invoices?${query}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { items?: RazorpayInvoice[] } | null;
  return Array.isArray(body?.items) ? body.items : null;
}
