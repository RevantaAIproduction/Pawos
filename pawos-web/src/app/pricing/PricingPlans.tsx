"use client";

import { useState } from "react";

/**
 * Mirrors PawOS's own src/shared/billing/BillingTypes.ts PricingPlan.
 * Go/Pro/Pro Max carry real, finalized flat prices. Team is seat-based with
 * two finalized seat rates (Standard $20/seat, Premium $100/seat) — a
 * member's seat tier is chosen when they're invited (see Organization
 * settings in the desktop app). Enterprise is seat-based at a finalized
 * $20/seat base fee plus prepaid Autonomous Engineering Task credits, billed
 * through the same success-gated prepaid credit system already used for
 * individual Pro/Pro Max accounts — never a flat per-seat rate.
 */
type SeatOption = { seatTier: "standard" | "premium"; label: string; priceCents: number; description: string };

type Plan = {
  id: string;
  label: string;
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
    seatOptions: [
      { seatTier: "standard", label: "Standard", priceCents: 2000, description: "Everything in Paw Pro Max, shared across your organization." },
      { seatTier: "premium", label: "Premium", priceCents: 10000, description: "Same organization features, at Pro Max-equivalent usage headroom." },
    ],
    features: [
      "Everything in Paw Pro Max",
      "Shared Workspaces & Shared Companions",
      "Organization Members & Admin Controls",
      "Shared Credits (Credit Pool)",
      "Task Management & Assignment",
      "AI-Assisted Git Collaboration (PR Review)",
      "Remote Assistance (Screen Share & Control)",
      "CRM Projection",
      "Credential Vault, Approval Queue & Audit Log",
      "SSO Configuration (Policy-Level)",
    ],
  },
  {
    id: "enterprise",
    label: "Paw Enterprise",
    priceCents: 2000,
    period: "month",
    seatBased: true,
    minSeats: 20,
    usageBilling: {
      label: "+ prepaid Autonomous Engineering Task credits",
      description: "One prepaid credit ($5) consumed per genuinely completed task, on top of the seat base fee — never for a failed, cancelled, retry-limit-reached, or approval-denied run.",
    },
    features: [
      "Everything in Paw Team",
      "Prepaid Autonomous Engineering Task Credits",
      "Richer Enterprise RBAC roles (IT Admin, Security Admin, Department Manager)",
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

      {plan.seatOptions ? (
        <div className="mt-4 space-y-3">
          {plan.seatOptions.map((seat) => (
            <div key={seat.seatTier} className="rounded-xl border border-neutral-800 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-neutral-200">{seat.label}</span>
                <span className="text-lg font-bold">${(seat.priceCents / 100).toFixed(0)}/seat/mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{seat.description}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-500">{plan.minSeats}–{plan.maxSeats} members · mix seat tiers freely across your organization</p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-3xl font-bold">{formatPrice(plan)}</p>
          {plan.usageBilling && (
            <>
              <p className="mt-2 text-sm font-medium text-blue-300">{plan.usageBilling.label}</p>
              <p className="mt-1 text-xs text-neutral-500">{plan.usageBilling.description}</p>
            </>
          )}
        </>
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
