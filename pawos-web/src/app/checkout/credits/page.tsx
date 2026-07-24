import type { Metadata } from "next";
import { Suspense } from "react";
import { CreditsCheckoutClient } from "./CreditsCheckoutClient";

export const metadata: Metadata = { title: "Buy Task Credits — PawOS" };

export default function CreditsCheckoutPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <Suspense fallback={<p className="text-center text-neutral-400">Loading…</p>}>
        <CreditsCheckoutClient />
      </Suspense>
    </div>
  );
}
