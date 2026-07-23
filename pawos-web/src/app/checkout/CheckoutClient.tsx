"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const TIER_LABELS: Record<string, string> = {
  go: "Paw Go",
  pro: "Paw Pro",
  proMax: "Paw Pro Max",
  team: "Paw Team",
  enterprise: "Paw Enterprise",
};

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

export function CheckoutClient() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") ?? "pro";
  const callback = searchParams.get("callback");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const startCheckout = async () => {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
        subscription_id: result.subscriptionId,
        name: "PawOS",
        description: `${TIER_LABELS[plan] ?? plan} subscription`,
        handler: () => {
          // Pings the Electron app's local loopback server (see
          // CheckoutSyncServer.ts) so it can mark the subscription active
          // immediately, without waiting on the user to refocus the app.
          // Best-effort only — the real webhook is authoritative once a
          // shared account backend exists.
          if (callback) {
            fetch(`${callback}?plan=${plan}`).catch(() => {});
          }
          setStatus("idle");
          setMessage("Payment complete — your PawOS app will sync the new plan automatically.");
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
      <h1 className="text-2xl font-bold">Upgrade to {TIER_LABELS[plan] ?? plan}</h1>
      <p className="mt-3 text-neutral-400">
        Payment is handled securely by Razorpay. After payment, your PawOS desktop app will refresh
        automatically — no need to enter anything back into Electron.
      </p>
      <button
        type="button"
        onClick={startCheckout}
        disabled={status === "loading"}
        className="mt-8 rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-8 py-3 font-semibold text-black hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Starting…" : "Continue to payment"}
      </button>
      {message && <p className="mt-6 text-sm text-neutral-400">{message}</p>}
    </div>
  );
}
