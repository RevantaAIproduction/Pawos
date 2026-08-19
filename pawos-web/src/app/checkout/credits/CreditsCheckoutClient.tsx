"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MIN_TICKET_BALANCE_TOPUP_USD, MAX_TICKET_BALANCE_TOPUP_USD, TICKET_BALANCE_TOPUP_PRESETS_USD, TICKET_PRICING_TIERS } from "@/lib/billing/razorpay";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CreditsCheckoutClient() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") ?? undefined;
  const callback = searchParams.get("callback");
  // P0-2: the Electron app's own signed-in Supabase session token, passed through so this page can
  // prove who is actually paying — never trusted from the callback ping alone. See
  // /api/billing/credit-ticket-balance for why this is required.
  const accessToken = searchParams.get("accessToken") ?? undefined;
  const [amountUsd, setAmountUsd] = useState(TICKET_BALANCE_TOPUP_PRESETS_USD[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Seeded from the code defaults, then replaced by the real, env-configurable values (see
  // getTicketPricingConfig() in razorpay.ts) the moment they load.
  const [pricingConfig, setPricingConfig] = useState({
    topupPresetsUsd: [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD,
    maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD,
  });

  useEffect(() => {
    fetch("/api/billing/ticket-pricing-config")
      .then((r) => r.json())
      .then((config) => setPricingConfig(config))
      .catch(() => {});
  }, []);

  const startCheckout = async () => {
    setStatus("loading");
    setMessage(null);
    if (!accessToken) {
      setStatus("error");
      setMessage("Missing your PawOS session — please reopen this checkout from the desktop app.");
      return;
    }
    try {
      const response = await fetch("/api/billing/checkout-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, organizationId, accessToken }),
      });
      const result = await response.json();

      if (!result.ok) {
        setStatus("error");
        setMessage(result.reason);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setStatus("error");
        setMessage("Could not load the payment form. Check your connection and try again.");
        return;
      }

      const checkout = new window.Razorpay({
        key: result.keyId,
        order_id: result.orderId,
        amount: Math.round(result.amountUsd * 100),
        currency: "USD",
        name: "PawOS",
        description: `Add $${amountUsd} to Ticket Balance`,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          // P0-2: this "success" callback fires client-side and could in principle be invoked by a
          // modified client with no real payment behind it — it is never trusted on its own.
          // Real crediting only happens after the server independently verifies the payment
          // signature and re-fetches the payment from Razorpay's own API (see
          // /api/billing/credit-ticket-balance). The Electron loopback ping below is now purely a
          // "please refresh your balance" notification — it carries no amount and cannot credit
          // anything by itself (the underlying RPC is service-role-only).
          if (!accessToken) {
            setStatus("error");
            setMessage("Missing your PawOS session — please reopen this checkout from the desktop app.");
            return;
          }
          try {
            const verifyResponse = await fetch("/api/billing/credit-ticket-balance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accessToken,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                organizationId,
              }),
            });
            const verifyResult = await verifyResponse.json();
            if (!verifyResult.ok) {
              setStatus("error");
              setMessage(verifyResult.reason ?? "Payment could not be verified.");
              return;
            }
            if (callback) {
              const url = new URL(callback);
              url.searchParams.set("type", "credits");
              url.searchParams.set("verified", "true");
              fetch(url.toString()).catch(() => {});
            }
            setStatus("idle");
            setMessage(`Payment verified — $${verifyResult.amountUsd} added to your Ticket Balance.`);
          } catch {
            setStatus("error");
            setMessage("Payment succeeded but verification failed. Contact support with your payment id if your balance doesn't update.");
          }
        },
        modal: {
          ondismiss: () => setStatus("idle"),
        },
      });
      checkout.open();
    } catch {
      setStatus("error");
      setMessage("Something went wrong starting checkout. Please try again.");
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
      <h1 className="text-2xl font-bold">Add funds to your Ticket Balance</h1>
      <p className="mt-3 text-neutral-400">
        Top up any amount — funds are deducted per ticket only once an Autonomous Ticket System
        investigation genuinely completes. The rate per ticket ranges from ${TICKET_PRICING_TIERS[TICKET_PRICING_TIERS.length - 1].pricePerTicketUsd.toFixed(2)}
        {" "}to ${TICKET_PRICING_TIERS[0].pricePerTicketUsd.toFixed(2)} depending on your account&apos;s cumulative ticket volume.
        Minimum top-up is ${pricingConfig.minTopupUsd}, maximum ${pricingConfig.maxTopupUsd.toLocaleString()}.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pricingConfig.topupPresetsUsd.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAmountUsd(n)}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              amountUsd === n ? "border-blue-400 bg-blue-500/10 text-blue-200" : "border-neutral-800 text-neutral-300 hover:text-neutral-100"
            }`}
          >
            ${n}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <label className="text-sm text-neutral-400" htmlFor="custom-amount">Custom amount</label>
        <span className="text-neutral-500">$</span>
        <input
          id="custom-amount"
          type="number"
          min={pricingConfig.minTopupUsd}
          max={pricingConfig.maxTopupUsd}
          value={amountUsd}
          onChange={(e) =>
            setAmountUsd(
              Math.min(pricingConfig.maxTopupUsd, Math.max(pricingConfig.minTopupUsd, Number(e.target.value) || pricingConfig.minTopupUsd))
            )
          }
          className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-center text-sm"
        />
      </div>

      <button
        type="button"
        onClick={startCheckout}
        disabled={status === "loading"}
        className="mt-8 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-8 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Starting…" : `Continue to payment — $${amountUsd}`}
      </button>
      {message && <p className="mt-6 text-sm text-neutral-400">{message}</p>}
    </div>
  );
}
