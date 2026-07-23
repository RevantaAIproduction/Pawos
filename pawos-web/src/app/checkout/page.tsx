import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = { title: "Checkout — PawOS" };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <Suspense fallback={<p className="text-center text-neutral-400">Loading…</p>}>
        <CheckoutClient />
      </Suspense>
    </div>
  );
}
