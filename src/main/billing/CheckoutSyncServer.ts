import * as http from 'http';
import { randomBytes } from 'crypto';
import { BrowserWindow } from 'electron';
import { subscriptionStore } from './SubscriptionStore';
import type { RuntimeEntitlementId, SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS } from '../../shared/billing/RuntimeCatalog';

const CALLBACK_PATH = '/checkout-callback';
const TIMEOUT_MS = 10 * 60 * 1000; // checkout sessions don't stay open forever — matches a generous real checkout window.
const VERIFY_SUBSCRIPTION_URL =
  process.env.PAWOS_WEB_URL || 'https://pawos.revantaai.com';
const VERIFY_SUBSCRIPTION_ENDPOINT = `${VERIFY_SUBSCRIPTION_URL}/api/billing/verify-subscription`;

function parseRuntimeIds(value: string[] | null | undefined): RuntimeEntitlementId[] {
  if (!value) return [];
  const valid = new Set<string>(ALL_RUNTIME_ENTITLEMENT_IDS);
  return value.filter((runtimeId, index, list) => valid.has(runtimeId) && list.indexOf(runtimeId) === index) as RuntimeEntitlementId[];
}

const VALID_TIERS: SubscriptionTierId[] = ['go', 'pro', 'proMax', 'team', 'enterprise'];

/**
 * P0-3 security fix. Previously this local loopback server trusted a bare `plan` query param
 * supplied by whoever pinged this endpoint — any script that could reach 127.0.0.1:<port> with the
 * (guessable-scope, same-session) syncToken could grant itself Enterprise with zero real payment.
 * Now the callback only ever carries the real Razorpay (paymentId, subscriptionId, signature) triple
 * Checkout.js handed the browser, and this function independently re-verifies that triple against
 * pawos-web's own /api/billing/verify-subscription route — which checks the signature against
 * Razorpay's key_secret (never available to Electron) and re-derives the tier from Razorpay's own
 * subscription record, never from anything the caller merely asserts.
 */
export async function verifySubscriptionWithBackend(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  accessToken?: string
): Promise<{ ok: true; tier: SubscriptionTierId; seatTier?: SeatTier; subscriptionId: string; runtimeIds: string[] } | { ok: false }> {
  try {
    const response = await fetch(VERIFY_SUBSCRIPTION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, subscriptionId, signature, accessToken }),
    });
    if (!response.ok) return { ok: false };
    const result = (await response.json()) as {
      ok?: boolean;
      tier?: string;
      seatTier?: SeatTier;
      subscriptionId?: string;
      runtimeIds?: unknown;
    };
    if (!result.ok || !result.tier || !VALID_TIERS.includes(result.tier as SubscriptionTierId)) return { ok: false };
    return {
      ok: true,
      tier: result.tier as SubscriptionTierId,
      seatTier: result.seatTier,
      subscriptionId: result.subscriptionId ?? subscriptionId,
      runtimeIds: Array.isArray(result.runtimeIds) ? (result.runtimeIds as string[]) : [],
    };
  } catch {
    return { ok: false };
  }
}

/**
 * "Electron should automatically refresh the user's subscription after
 * payment" — same loopback-server pattern GoogleOAuthFlow.ts already uses
 * for its browser-based sign-in callback. The website's checkout page pings
 * this local server (loopback, no network exposure) right after Razorpay's
 * checkout.js reports success, carrying the real Razorpay payment/
 * subscription/signature triple.
 *
 * P0-3 security fix: this local ping is proof of "same machine, same
 * session" only — never proof of payment. This server now treats it as
 * exactly that: a trigger to independently re-verify the real Razorpay data
 * against pawos-web's own /api/billing/verify-subscription route (which
 * holds the Razorpay key_secret Electron never has) before ever calling
 * subscriptionStore.confirmPurchase(). A forged local ping with an invalid
 * or mismatched signature/subscription is rejected by that route and never
 * activates anything.
 */
export function startCheckoutCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const syncToken = randomBytes(16).toString('hex');
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (url.searchParams.get('token') !== syncToken) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('forbidden');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('ok');

      // `type=credits` distinguishes a Ticket Balance top-up (see
      // CreditsCheckoutClient.tsx) from a subscription purchase. Crediting the wallet has ALREADY
      // happened server-side by the time this ping ever arrives (CreditsCheckoutClient.tsx only
      // pings this endpoint after /api/billing/credit-ticket-balance already returned ok:true) —
      // this ping carries no amount and is never authoritative for anything. It exists purely to
      // tell Electron's already-open windows "go re-fetch your real balance from Supabase now"
      // rather than waiting for the next natural refresh. Broadcasting unconditionally (not gated on
      // any query param) is the fix: previously this branch required a caller-supplied amountUsd
      // param that the real checkout flow never actually sends, so this notification never fired in
      // practice.
      if (url.searchParams.get('type') === 'credits') {
        const organizationId = url.searchParams.get('organizationId') || undefined;
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('billing:taskCreditsPurchased', { organizationId });
        }
        clearTimeout(timeoutHandle);
        server.close();
        return;
      }

      // P0-3: the callback no longer carries a trusted `plan` string — only the real Razorpay
      // (paymentId, subscriptionId, signature) triple, independently re-verified against pawos-web
      // below before anything is activated.
      const paymentId = url.searchParams.get('paymentId');
      const subscriptionId = url.searchParams.get('subscriptionId');
      const signature = url.searchParams.get('signature');
      clearTimeout(timeoutHandle);
      server.close();
      if (paymentId && subscriptionId && signature) {
        verifySubscriptionWithBackend(paymentId, subscriptionId, signature).then((verified) => {
          if (!verified.ok) return;
          subscriptionStore.confirmPurchase(verified.tier, {
            runtimeIds: parseRuntimeIds(verified.runtimeIds),
            orderId: verified.subscriptionId,
          });
          for (const win of BrowserWindow.getAllWindows()) win.webContents.send('billing:subscriptionUpdated');
        });
      }
    });

    const timeoutHandle = setTimeout(() => server.close(), TIMEOUT_MS);

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}${CALLBACK_PATH}?token=${syncToken}`);
    });
  });
}
