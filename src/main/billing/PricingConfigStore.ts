import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { PricingConfig } from '../../shared/billing/BillingTypes';

const FILE_NAME = 'pricing.json';

/**
 * Editable pricing configuration, persisted to userData so prices can be
 * revised later without a code change/redeploy. Go/Pro/Pro Max carry real,
 * finalized flat prices. Team is seat-based with two real seat rates
 * (Standard $20/seat/mo, Premium $100/seat/mo — see seatOptions). Enterprise
 * is seat-based at a $20/seat/mo base fee plus metered Autonomous
 * Engineering Task usage billed through the existing success-gated
 * Autonomous Task Billing system (see usageBilling) — not a flat per-seat
 * rate.
 */
function defaultConfig(): PricingConfig {
  return {
    // RazorpayBillingProvider's own checkout route has been live since 2026-08-02 (see its own
    // header comment) — defaulting to 'none' here left every checkout attempt hitting
    // NoOpBillingProvider's "No payment provider is configured yet" message even though the real
    // provider was fully wired and ready. 'none' is preserved purely as a legitimate manual
    // kill-switch (an admin explicitly persisting billingProvider:'none' via update()), not as the
    // default a fresh install should ever start from.
    billingProvider: 'razorpay',
    plans: [
      {
        id: 'go',
        label: 'Go',
        priceCents: 0,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Companion Studio',
          'Upload Companion',
          'Desktop Companion',
          'Basic Workspace',
          'Basic File Management',
          'Local Runtime Features',
          'AI-powered planning & analysis with Paw Flash — execution requires Pro',
        ],
      },
      {
        id: 'pro',
        label: 'Pro',
        priceCents: 2000,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Everything in Go',
          'Full AI models: Paw Flash, Swift, Core, Creative, Vision & Voice',
          'Eligible to purchase/select production-ready runtime entitlements',
          'Coding Runtime can be added explicitly for terminal, file, git, build, and validation execution',
          'Paw remembers context across your workspace and conversation history',
        ],
      },
      {
        id: 'proMax',
        label: 'Pro Max',
        priceCents: 10000,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Everything in Pro',
          '20x the usage headroom of Pro',
          'Runtime purchases remain cumulative across Pro and Pro Max',
          'Priority access to new Paw models',
        ],
      },
      {
        id: 'team',
        label: 'Team',
        tagline: 'Predictable usage per seat',
        priceCents: 2000,
        currency: 'USD',
        billingPeriod: 'month',
        seatBased: true,
        minSeats: 2,
        maxSeats: 150,
        seatOptions: [
          {
            seatTier: 'standard',
            label: 'Standard',
            priceCents: 2000,
            description: 'Everything in Pro Max, shared across your organization.',
          },
          {
            seatTier: 'premium',
            label: 'Premium',
            priceCents: 10000,
            description: 'Same organization features as Standard, at Pro Max-equivalent usage headroom.',
          },
        ],
        features: [
          'Everything in Pro Max',
          'Shared Workspaces',
          'Organization Members',
          'Shared Companions',
          'Shared Credits (Credit Pool)',
          'Admin Controls',
          'Team Billing',
          'Task Management & Assignment',
          'AI-Assisted Git Collaboration (PR Review)',
          'Remote Assistance (Screen Share & Control)',
          'CRM Projection',
          'Credential Vault',
          'Approval Queue',
          'Audit Log',
          'SSO Configuration (Policy-Level)',
        ],
      },
      {
        id: 'enterprise',
        label: 'Enterprise',
        tagline: 'Flexible pooled usage',
        priceCents: 2000,
        currency: 'USD',
        billingPeriod: 'month',
        seatBased: true,
        minSeats: 20,
        usageBilling: {
          label: 'Seat price + usage at API rates',
          description:
            '$20/seat + tax. Usage cost scales with model and task, billed per genuinely completed Autonomous Engineering Task — never for a failed, cancelled, retry-limit-reached, or approval-denied run.',
        },
        features: [
          'Everything in Team',
          'Uniform $20/seat base rate — no Standard/Premium split',
          'Autonomous Ticket System usage billed at pass-through API rates instead of tiered Ticket Balance pricing',
          'Additional RBAC roles: IT Administrator, Security Administrator, Department Manager',
        ],
      },
    ],
  };
}

class PricingConfigStore {
  private file = '';
  private config: PricingConfig = defaultConfig();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // `plans` always comes from code, not disk — no admin tooling has ever
    // written a real custom plan list (update() isn't wired to any UI yet),
    // so a stale persisted `plans` array from an older code version must
    // never shadow the current tier/feature set. Only `billingProvider` is
    // a real standing choice worth persisting across restarts.
    const fresh = defaultConfig();
    try {
      const persisted = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<PricingConfig>;
      // 'none' has never been a real, deliberate choice — update() (the only way to persist a
      // legitimate override) isn't wired to any UI yet, so the only way 'none' could be on disk is
      // as the old, buggy default written automatically on first launch before real checkout was
      // configured. Honoring it would leave every already-launched install permanently stuck on
      // NoOpBillingProvider even after the real provider went live — treat it the same as absent.
      const persistedProvider = persisted.billingProvider !== 'none' ? persisted.billingProvider : undefined;
      this.config = { ...fresh, billingProvider: persistedProvider ?? fresh.billingProvider };
    } catch {
      this.config = fresh;
    }
    this.save();
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): PricingConfig {
    return this.config;
  }

  /** For future admin/business tooling to finalize real prices — not exposed in any UI yet. */
  update(config: PricingConfig): void {
    this.config = config;
    this.save();
  }
}

export const pricingConfigStore = new PricingConfigStore();
