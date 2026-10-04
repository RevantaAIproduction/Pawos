"use client";

import { useState } from "react";
import { OrgPlans } from "./OrgPlans";

/**
 * Mirrors PawOS's own src/shared/billing/BillingTypes.ts PricingPlan.
 * Go/Pro/Pro Max carry real, finalized flat prices. Team is seat-based with
 * two finalized seat rates (Standard $20/seat, Premium $100/seat) — a
 * member's seat tier is chosen when they're invited (see Organization
 * settings in the desktop app). Enterprise is seat-based at a finalized
 * $20/seat base fee plus the Autonomous Ticket System's own Ticket Balance
 * (a separate prepaid dollar wallet, volume-tiered per ticket — see
 * src/shared/organization/AutonomousTaskBillingTypes.ts) — never a flat
 * per-seat rate.
 */
type SeatOption = { seatTier: "standard" | "premium"; label: string; priceCents: number; description: string };

type Plan = {
  id: string;
  label: string;
  tagline?: string;
  priceCents: number | null;
  period: "month";
  seatBased?: boolean;
  minSeats?: number;
  maxSeats?: number;
  seatOptions?: SeatOption[];
  usageBilling?: { label: string; description: string };
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
      "AI-powered planning & analysis with Paw Flash — execution requires Paw Pro",
      "500 PC included every 14 days",
    ],
  },
  {
    id: "pro",
    label: "Paw Pro",
    priceCents: 2000,
    period: "month",
    features: [
      "Everything in Paw Go",
      "2,000 PC included each billing period (weekly limit 1,000 PC)",
      "Full AI models: Paw Flash, Swift, Core, Vision & Voice",
      "Eligible to purchase/select production-ready runtime entitlements",
      "Coding Runtime can be added explicitly for terminal, file, git, build, and validation execution",
      "Paw remembers context across your workspace and conversation history",
    ],
  },
  {
    id: "proMax",
    label: "Paw Pro Max",
    priceCents: 10000,
    period: "month",
    features: [
      "Everything in Paw Pro",
      "Pro Max 5x: 10,000 PC included each billing period (weekly limit 5,000 PC)",
      "Pro Max 20x ($250/mo): 25,000 PC included each billing period (weekly limit 12,500 PC)",
      "Runtime purchases remain cumulative across Pro and Pro Max",
      "Priority access to new Paw models",
    ],
  },
];

function formatPrice(plan: Plan): string {
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}–${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing — ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/mo — ${range}`;
  }
  if (plan.priceCents === null) return "Contact sales";
  if (plan.priceCents === 0) return "Free";
  return `$${(plan.priceCents / 100).toFixed(2)}/mo`;
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
      <h2 className="text-xl font-semibold">{plan.label}</h2>
      {plan.tagline && <p className="mt-1 text-sm text-neutral-500">{plan.tagline}</p>}

      {plan.seatOptions ? (
        <div className="mt-4 space-y-3">
          {plan.seatOptions.map((seat) => (
            <div key={seat.seatTier} className="rounded-xl border border-neutral-800 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-neutral-200">{seat.label}</span>
                <span className="text-lg font-bold">${(seat.priceCents / 100).toFixed(0)}<span className="text-sm font-normal text-neutral-500">/seat/mo</span></span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{seat.description}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-500">{plan.minSeats}–{plan.maxSeats} members · mix seat tiers freely across your organization</p>
        </div>
      ) : plan.usageBilling ? (
        <div className="mt-4 rounded-xl border border-neutral-800 p-4">
          <span className="text-sm font-semibold text-neutral-200">{plan.usageBilling.label}</span>
          <p className="mt-1 text-xs text-neutral-500">{plan.usageBilling.description}</p>
        </div>
      ) : (
        <p className="mt-2 text-3xl font-bold">{formatPrice(plan)}</p>
      )}

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

      {tab === "individual" ? (
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {INDIVIDUAL_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      ) : (
        <div className="mt-14">
          <OrgPlans />
        </div>
      )}
    </div>
  );
}
