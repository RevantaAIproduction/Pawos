import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listRazorpayInvoices, razorpayAuthHeader } from "../billing/razorpay";

/**
 * Deleting a PawOS account from Settings on PawOS Web (/api/dashboard/account).
 *
 * Only ever on the account holder's own request: a signed-in session, a 6-digit code emailed to the
 * account's address, and the address typed back. Nothing deletes an account automatically.
 *
 * An account is NOT deleted while it still owes money — an unpaid Razorpay invoice, a subscription
 * whose renewal charge failed (pending / halted), or an unpaid invoice-billing case. The person pays
 * first, then deletes. Nor while it owns an organization (other people's workspace hangs off it).
 *
 * When nothing blocks it: paid-up subscriptions are cancelled at Razorpay (so nothing renews), then
 * the auth user is deleted, which removes the account's data through the foreign keys' ON DELETE
 * rules (supabase/migrations/20261005000000_account_deletion_fk_rules.sql).
 */

export const DELETE_CODE_COOKIE = "pawos_account_delete";
export const DELETE_CODE_TTL_SECONDS = 10 * 60;
/** Only for this cookie: it's read by DELETE /api/dashboard/account and nothing else. */
export const DELETE_CODE_COOKIE_PATH = "/api/dashboard/account";

export type DeletionBlocker = { code: "unpaid_invoice" | "payment_due" | "unpaid_billing_case" | "owns_organization"; message: string };

type RazorpayCredentials = { keyId: string; keySecret: string };

function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  // A key derived for this one purpose — the service-role key itself never signs anything here.
  return createHash("sha256").update(`pawos-account-delete:${secret}`).digest();
}

function sign(userId: string, code: string, expiresAt: number): string {
  return createHmac("sha256", signingKey()).update(`${userId}:${code}:${expiresAt}`).digest("hex");
}

/**
 * A fresh confirmation code and the cookie value that proves it was issued to this user. The cookie
 * holds only an expiry and an HMAC — not the code — so it can't be read back from the browser.
 */
export function issueDeleteCode(userId: string, now = Date.now()): { code: string; cookieValue: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = now + DELETE_CODE_TTL_SECONDS * 1000;
  return { code, cookieValue: `${expiresAt}.${sign(userId, code, expiresAt)}` };
}

export function verifyDeleteCode(userId: string, code: string, cookieValue: string | undefined, now = Date.now()): "ok" | "expired" | "invalid" {
  if (!cookieValue || !/^\d{6}$/.test(code)) return "invalid";
  const [expiresRaw, mac] = cookieValue.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !mac) return "invalid";
  if (now > expiresAt) return "expired";
  const expected = Buffer.from(sign(userId, code, expiresAt));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? "ok" : "invalid";
}

/** Statuses of a subscription that is paid up and would renew — cancelled when the account is deleted. */
const RENEWING = ["active", "authenticated"];
/** A renewal charge failed and is still owed. */
const PAYMENT_DUE = ["pending", "halted"];
/** Razorpay invoice statuses that mean money is still owed. */
const UNPAID_INVOICE = ["issued", "partially_paid"];

export class DeletionCheckError extends Error {}

/**
 * Everything that stops this account from being deleted right now. Throws DeletionCheckError when
 * PawOS can't confirm there's nothing owed (a lookup failed) — deletion never proceeds on a guess.
 */
export async function findDeletionBlockers(service: SupabaseClient, userId: string, credentials: RazorpayCredentials | null): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];

  const { data: orgs, error: orgError } = await service.from("organizations").select("name").eq("owner_user_id", userId);
  if (orgError) throw new DeletionCheckError("Could not check your organizations.");
  for (const org of (orgs ?? []) as { name: string }[]) {
    blockers.push({
      code: "owns_organization",
      message: `You own the organization "${org.name}". Transfer it to another member or ask pawos@revantaai.com to close it before deleting your account.`,
    });
  }

  const { data: cases, error: caseError } = await service
    .from("billing_cases")
    .select("id, usd_total, payment_status, validation_status")
    .eq("user_id", userId)
    .in("payment_status", ["pending", "unpaid"]);
  if (caseError) throw new DeletionCheckError("Could not check your invoices.");
  for (const c of (cases ?? []) as { id: string; usd_total: number | null; validation_status: string | null }[]) {
    if (c.validation_status === "rejected") continue;
    blockers.push({
      code: "unpaid_billing_case",
      message: `Invoice ${c.id}${c.usd_total ? ` ($${Number(c.usd_total).toLocaleString("en-US")})` : ""} hasn't been paid yet. Pay it, then delete your account.`,
    });
  }

  const subscriptions = await readSubscriptions(service, userId);
  for (const sub of subscriptions) {
    if (PAYMENT_DUE.includes(sub.status)) {
      blockers.push({ code: "payment_due", message: "A subscription payment failed and is still due. Pay it from Billing, then delete your account." });
    }
  }
  if (subscriptions.length > 0) {
    if (!credentials) throw new DeletionCheckError("Payments can't be checked right now.");
    for (const sub of subscriptions) {
      const invoices = await listRazorpayInvoices(credentials, sub.id);
      if (!invoices) throw new DeletionCheckError("Could not check your invoices.");
      for (const invoice of invoices) {
        if (invoice.subscription_id && invoice.subscription_id !== sub.id) continue;
        if (UNPAID_INVOICE.includes(invoice.status)) {
          const amount = typeof invoice.amount === "number" ? ` (${(invoice.amount / 100).toLocaleString("en-IN", { style: "currency", currency: invoice.currency || "INR" })})` : "";
          blockers.push({
            code: "unpaid_invoice",
            message: `Invoice ${invoice.id}${amount} is unpaid.${invoice.short_url ? ` Pay it at ${invoice.short_url}` : " Pay it"}, then delete your account.`,
          });
        }
      }
    }
  }

  // The same payment can show up as both a failed subscription and its unpaid invoice; say it once.
  return blockers.filter((b, i) => blockers.findIndex((o) => o.message === b.message) === i);
}

async function readSubscriptions(service: SupabaseClient, userId: string): Promise<{ id: string; status: string }[]> {
  const { data, error } = await service.from("pawos_subscriptions").select("id, status").eq("user_id", userId);
  if (error) throw new DeletionCheckError("Could not check your subscriptions.");
  return (data ?? []) as { id: string; status: string }[];
}

async function cancelRazorpaySubscription(id: string, credentials: RazorpayCredentials): Promise<boolean> {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  if (response.ok) return true;
  // Already cancelled / completed at Razorpay: nothing left to stop.
  const body = (await response.json().catch(() => null)) as { error?: { description?: string } } | null;
  return /cancel|complete/i.test(body?.error?.description ?? "");
}

/**
 * Cancels the account's renewing subscriptions, then deletes the auth user (and with it the
 * account's data). Call only after findDeletionBlockers() returned nothing. If a cancellation fails
 * nothing is deleted, so the account is never gone while still being billed.
 */
export async function deleteAccount(service: SupabaseClient, userId: string, credentials: RazorpayCredentials | null): Promise<void> {
  const renewing = (await readSubscriptions(service, userId)).filter((s) => RENEWING.includes(s.status));
  if (renewing.length > 0 && !credentials) throw new DeletionCheckError("Your subscription can't be cancelled right now.");
  for (const sub of renewing) {
    if (!(await cancelRazorpaySubscription(sub.id, credentials!))) throw new DeletionCheckError("Your subscription couldn't be cancelled, so your account wasn't deleted.");
  }
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}
