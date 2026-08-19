import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { TicketPricingConfig } from '../../shared/billing/BillingTypes';
import { MIN_TICKET_BALANCE_TOPUP_USD, MAX_TICKET_BALANCE_TOPUP_USD, TICKET_BALANCE_TOPUP_PRESETS_USD } from '../../shared/organization/AutonomousTaskBillingTypes';

const FILE_NAME = 'ticketPricing.json';

/**
 * Editable Ticket Balance top-up configuration, persisted to userData so new preset amounts (e.g.
 * a future $500 option) or a revised minimum can be added later purely as data — no code change or
 * redeploy required. Unlike PricingConfigStore's `plans` (which always comes from code since no
 * admin tool writes it yet), the persisted values here are the real, standing configuration —
 * TICKET_BALANCE_TOPUP_PRESETS_USD/MIN_TICKET_BALANCE_TOPUP_USD only seed the file on first run.
 */
function defaultConfig(): TicketPricingConfig {
  return {
    topupPresetsUsd: [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD,
    maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD,
  };
}

class TicketPricingConfigStore {
  private file = '';
  private config: TicketPricingConfig = defaultConfig();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const persisted = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<TicketPricingConfig>;
      const fresh = defaultConfig();
      this.config = {
        topupPresetsUsd: Array.isArray(persisted.topupPresetsUsd) && persisted.topupPresetsUsd.length > 0
          ? persisted.topupPresetsUsd.filter((n) => typeof n === 'number' && n > 0)
          : fresh.topupPresetsUsd,
        minTopupUsd: typeof persisted.minTopupUsd === 'number' && persisted.minTopupUsd > 0 ? persisted.minTopupUsd : fresh.minTopupUsd,
        maxTopupUsd: typeof persisted.maxTopupUsd === 'number' && persisted.maxTopupUsd > 0 ? persisted.maxTopupUsd : fresh.maxTopupUsd,
      };
    } catch {
      this.config = defaultConfig();
    }
    this.save();
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): TicketPricingConfig {
    return this.config;
  }

  /** For future admin/business tooling to add or change top-up presets without a code change. */
  update(config: TicketPricingConfig): void {
    this.config = config;
    this.save();
  }
}

export const ticketPricingConfigStore = new TicketPricingConfigStore();
