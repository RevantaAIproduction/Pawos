import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pricing — PawOS" };

/**
 * Mirrors the shape (not the values) of PawOS's own
 * src/shared/billing/BillingTypes.ts PricingPlan — priceCents stays null
 * until a real price is decided (Business Configuration Required). Kept as
 * a local, static config here since this is a separately deployed site, not
 * sharing a build with the Electron app.
 */
const PLANS: {
  id: string;
  label: string;
  priceCents: number | null;
  period: "month";
  features: string[];
}[] = [
  {
    id: "go",
    label: "Paw Go",
    priceCents: 0,
    period: "month",
    features: [
      "Planning & analysis",
      "Project understanding",
      "Read-only Coding Canvas",
      "Dependency & file-impact analysis",
    ],
  },
  {
    id: "pro",
    label: "Paw Pro",
    priceCents: null,
    period: "month",
    features: [
      "Everything in Paw Go",
      "Full Coding Canvas",
      "Code generation & editing",
      "Terminal execution",
      "Build & test automation",
      "Browser preview & console",
    ],
  },
];

function formatPrice(priceCents: number | null): string {
  if (priceCents === null) return "Pricing coming soon";
  if (priceCents === 0) return "Free";
  return `$${(priceCents / 100).toFixed(2)}/mo`;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <h1 className="text-center text-4xl font-bold">Pricing</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-neutral-400">
        PawOS pricing is still being finalized. Paw Go is free today; Paw Pro's price hasn't been
        set yet.
      </p>

      <div className="mt-14 grid gap-6 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
            <h2 className="text-xl font-semibold">{plan.label}</h2>
            <p className="mt-2 text-3xl font-bold">{formatPrice(plan.priceCents)}</p>
            <ul className="mt-6 space-y-2 text-sm text-neutral-400">
              {plan.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
