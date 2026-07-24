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
    billingProvider: 'none',
    plans: [
      {
        id: 'go',
        label: 'Paw Go',
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
          'No AI models or AI runtimes',
        ],
      },
      {
        id: 'pro',
        label: 'Paw Pro',
        priceCents: 2000,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Everything in Paw Go',
          'Paw Flash, Swift & Core reasoning models',
          'Paw Creative, Vision & Voice',
          'Higher runtime limits',
          'Advanced runtimes',
        ],
      },
      {
        id: 'proMax',
        label: 'Paw Pro Max',
        priceCents: 10000,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Everything in Paw Pro',
          'Higher usage limits than Pro',
          'Priority access to new Paw models',
        ],
      },
      {
        id: 'team',
        label: 'Paw Team',
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
            description: 'Everything in Paw Pro Max, shared across your organization.',
          },
          {
            seatTier: 'premium',
            label: 'Premium',
            priceCents: 10000,
            description: 'Same organization features as Standard, at Pro Max-equivalent usage headroom.',
          },
        ],
        features: [
          'Everything in Paw Pro Max',
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
        label: 'Paw Enterprise',
        priceCents: 2000,
        currency: 'USD',
        billingPeriod: 'month',
        seatBased: true,
        minSeats: 20,
        usageBilling: {
          label: 'Autonomous Engineering Task usage',
          description:
            'Billed per genuinely completed Autonomous Engineering Task, on top of the seat base fee — never for a failed, cancelled, retry-limit-reached, or approval-denied run.',
        },
        features: [
          'Everything in Paw Team',
          'Metered Autonomous Engineering Task Billing',
          'Richer Enterprise RBAC roles (IT Admin, Security Admin, Department Manager)',
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
      this.config = { ...fresh, billingProvider: persisted.billingProvider ?? fresh.billingProvider };
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
