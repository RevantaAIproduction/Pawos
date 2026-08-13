import * as http from 'http';
import { randomBytes } from 'crypto';
import { BrowserWindow } from 'electron';
import { subscriptionStore } from './SubscriptionStore';
import type { RuntimeEntitlementId, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS } from '../../shared/billing/RuntimeCatalog';

const CALLBACK_PATH = '/checkout-callback';
const TIMEOUT_MS = 10 * 60 * 1000; // checkout sessions don't stay open forever — matches a generous real checkout window.

function parseRuntimeIds(value: string | null): RuntimeEntitlementId[] {
  if (!value) return [];
  const valid = new Set<string>(ALL_RUNTIME_ENTITLEMENT_IDS);
  return value
    .split(',')
    .map((runtimeId) => runtimeId.trim())
    .filter((runtimeId, index, list) => valid.has(runtimeId) && list.indexOf(runtimeId) === index) as RuntimeEntitlementId[];
}

/**
 * "Electron should automatically refresh the user's subscription after
 * payment" — same loopback-server pattern GoogleOAuthFlow.ts already uses
 * for its browser-based sign-in callback. There's no shared account/
 * subscription backend yet (pawos-web's Razorpay webhook has nowhere real
 * to write to — see its own comment), so this is the honest mechanism
 * available today: the website's checkout page pings this local server
 * directly (loopback, no network exposure) right after Razorpay's
 * checkout.js reports success, and this process is the one that actually
 * marks the local subscription active. The real webhook remains the
 * authoritative source once a shared backend exists — this is a same-
 * machine UX shortcut, not a replacement for server-side verification.
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
      // CreditsCheckoutClient.tsx) from a subscription purchase — the
      // renderer (which holds the Supabase session) is the one that
      // actually calls add_ticket_balance(), since this main-process server
      // has no Supabase client of its own.
      if (url.searchParams.get('type') === 'credits') {
        const amountUsd = Number(url.searchParams.get('amountUsd'));
        const organizationId = url.searchParams.get('organizationId') || undefined;
        if (Number.isFinite(amountUsd) && amountUsd > 0) {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('billing:taskCreditsPurchased', { amountUsd, organizationId });
          }
        }
      } else {
        const plan = url.searchParams.get('plan') as SubscriptionTierId | null;
        if (plan) {
          const runtimeIds = parseRuntimeIds(url.searchParams.get('runtimeIds'));
          const orderId =
            url.searchParams.get('orderId') ??
            url.searchParams.get('razorpay_subscription_id') ??
            url.searchParams.get('razorpay_payment_id') ??
            undefined;
          subscriptionStore.confirmPurchase(plan, { runtimeIds, orderId });
          for (const win of BrowserWindow.getAllWindows()) win.webContents.send('billing:subscriptionUpdated');
        }
      }
      clearTimeout(timeoutHandle);
      server.close();
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
