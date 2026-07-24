"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { MIN_TASK_CREDIT_PURCHASE, TASK_CREDIT_PRICE_USD } from "@/lib/billing/razorpay";

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

const CREDIT_BUNDLES = [MIN_TASK_CREDIT_PURCHASE, 12, 25, 50];

export function CreditsCheckoutClient() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organizationId") ?? undefined;
  const callback = searchParams.get("callback");
  const [credits, setCredits] = useState(MIN_TASK_CREDIT_PURCHASE);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const startCheckout = async () => {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits, organizationId }),
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
        amount: result.amountUsd * 100,
        currency: "USD",
        name: "PawOS",
        description: `${credits} Autonomous Engineering Task credits`,
        handler: () => {
          // Pings the Electron app's local loopback server (see
          // CheckoutSyncServer.ts) so it can add the purchased credits
          // immediately via the security-definer add_task_credits() RPC,
          // using the purchaser's own Supabase session — same same-machine
          // trust model already accepted for subscription activation.
          if (callback) {
            const url = new URL(callback);
            url.searchParams.set("type", "credits");
            url.searchParams.set("credits", String(credits));
            if (organizationId) url.searchParams.set("organizationId", organizationId);
            fetch(url.toString()).catch(() => {});
          }
          setStatus("idle");
          setMessage("Payment complete — your PawOS desktop app will add the credits automatically.");
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
      <h1 className="text-2xl font-bold">Buy Autonomous Engineering Task credits</h1>
      <p className="mt-3 text-neutral-400">
        ${TASK_CREDIT_PRICE_USD}/credit — one credit is deducted only when a task genuinely completes.
        Minimum purchase is {MIN_TASK_CREDIT_PURCHASE} credits (${MIN_TASK_CREDIT_PURCHASE * TASK_CREDIT_PRICE_USD}).
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CREDIT_BUNDLES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCredits(n)}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              credits === n ? "border-blue-400 bg-blue-500/10 text-blue-200" : "border-neutral-800 text-neutral-300 hover:text-neutral-100"
            }`}
          >
            {n} credits
            <div className="mt-1 text-xs font-normal text-neutral-500">${n * TASK_CREDIT_PRICE_USD}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <label className="text-sm text-neutral-400" htmlFor="custom-credits">Custom amount</label>
        <input
          id="custom-credits"
          type="number"
          min={MIN_TASK_CREDIT_PURCHASE}
          value={credits}
          onChange={(e) => setCredits(Math.max(MIN_TASK_CREDIT_PURCHASE, Number(e.target.value) || MIN_TASK_CREDIT_PURCHASE))}
          className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-center text-sm"
        />
      </div>

      <button
        type="button"
        onClick={startCheckout}
        disabled={status === "loading"}
        className="mt-8 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-8 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Starting…" : `Continue to payment — $${credits * TASK_CREDIT_PRICE_USD}`}
      </button>
      {message && <p className="mt-6 text-sm text-neutral-400">{message}</p>}
    </div>
  );
}
