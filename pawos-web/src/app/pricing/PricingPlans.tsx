"use client";

import { useState } from "react";

/**
 * Mirrors the shape (not necessarily every value) of PawOS's own
 * src/shared/billing/BillingTypes.ts PricingPlan. Go/Pro/Pro Max carry
 * real, finalized flat prices. Team and Enterprise are seat-based — no
 * per-seat rate has been finalized yet, so priceCents stays null
 * ("Business Configuration Required"), never a fabricated number.
 */
type Plan = {
  id: string;
  label: string;
  priceCents: number | null;
  period: "month";
  seatBased?: boolean;
  minSeats?: number;
  maxSeats?: number;
  features: string[];
};

const INDIVIDUAL_PLANS: Plan[] = [
  {
    id: "go",
    label: "Paw Go",
    priceCents: 0,
    period: "month",
    features: [
      "Companion Studio & Upload Companion",
      "Desktop Companion",
      "Basic Workspace & File Management",
      "Local Runtime Features",
      "No AI models or AI runtimes",
    ],
  },
  {
    id: "pro",
    label: "Paw Pro",
    priceCents: 2000,
    period: "month",
    features: [
      "Everything in Paw Go",
      "Paw Flash, Swift & Core reasoning models",
      "Paw Creative, Vision & Voice",
      "Higher runtime limits",
      "Advanced runtimes",
    ],
  },
  {
    id: "proMax",
    label: "Paw Pro Max",
    priceCents: 10000,
    period: "month",
    features: [
      "Everything in Paw Pro",
      "Higher usage limits than Pro",
      "Priority access to new Paw models",
    ],
  },
];

const TEAM_ENTERPRISE_PLANS: Plan[] = [
  {
    id: "team",
    label: "Paw Team",
    priceCents: 2000,
    period: "month",
    seatBased: true,
    minSeats: 2,
    maxSeats: 150,
    features: [
      "Everything in Paw Pro Max",
      "Shared Workspaces & Companions",
      "Organization Members",
      "Shared Credits",
      "Admin Controls & Team Billing",
    ],
  },
  {
    id: "enterprise",
    label: "Paw Enterprise",
    priceCents: 10000,
    period: "month",
    seatBased: true,
    minSeats: 20,
    features: [
      "Everything in Paw Team",
      "Unlimited Organizations",
      "Advanced Security & Custom Limits",
      "Custom Billing",
      "Priority Support & Dedicated Features",
    ],
  },
];

function formatPrice(plan: Plan): string {
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}–${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing — ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/mo — ${range}`;
  }
  if (plan.priceCents === null) return "Pricing coming soon";
  if (plan.priceCents === 0) return "Free";
  return `$${(plan.priceCents / 100).toFixed(2)}/mo`;
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h2 className="text-xl font-semibold">{plan.label}</h2>
      <p className="mt-2 text-3xl font-bold">{formatPrice(plan)}</p>
      <ul className="mt-6 space-y-2 text-sm text-neutral-400">
        {plan.features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
    </div>
  );
}

export function PricingPlans() {
  const [tab, setTab] = useState<"individual" | "team">("individual");
  const plans = tab === "individual" ? INDIVIDUAL_PLANS : TEAM_ENTERPRISE_PLANS;

  return (
    <div>
      <div className="mx-auto mt-10 flex w-fit gap-1 rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
        <button
          type="button"
          onClick={() => setTab("individual")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            tab === "individual" ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Individual
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            tab === "team" ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Team and Enterprise
        </button>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}
