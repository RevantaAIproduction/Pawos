import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { PricingConfig } from '../../shared/billing/BillingTypes';

const FILE_NAME = 'pricing.json';

/**
 * Editable pricing configuration, persisted to userData so real prices can
 * be finalized later without a code change/redeploy. Defaults intentionally
 * leave priceCents null on every plan — "Business Configuration Required" —
 * this store never invents a number.
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
        features: ['Planning & analysis', 'Read-only Coding Canvas', 'Project understanding'],
      },
      {
        id: 'pro',
        label: 'Paw Pro',
        priceCents: null,
        currency: 'USD',
        billingPeriod: 'month',
        features: [
          'Everything in Paw Go',
          'Full Coding Canvas',
          'Code generation & editing',
          'Terminal execution',
          'Build & test automation',
          'Browser preview & console',
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
    try {
      this.config = { ...defaultConfig(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
    } catch {
      this.save();
    }
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
