import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Every screen where a credit or Ticket Balance amount can be typed. Each one refuses an amount over
 * the per-transaction maximum (it never clamps it silently or splits it), names the maximum it was
 * given by the pricing configuration, and shows the contact-sales note. The server's own limit is the
 * authority either way (pawos-web lib/billing: usageCreditsCrediting.ts, ticketBalanceCrediting.ts).
 */
const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const DESKTOP_SURFACES: [string, string, string][] = [
  // file, the limit it compares against, the limit it passes to the note
  ['src/renderer/ui/Dashboard/sections/UsageCreditsPanel.tsx', 'amountUsd > config.maxTopupUsd', 'maxUsd={config.maxTopupUsd}'],
  ['src/renderer/ui/billing/NativeBillingCheckoutModal.tsx', 'v > max', 'maxUsd={max}'],
  ['src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx', 'parsed > pricingConfig.maxTopupUsd', 'maxUsd={pricingConfig.maxTopupUsd}'],
  ['src/renderer/ui/Dashboard/sections/AutonomousTaskBillingCard.tsx', 'parsed > pricingConfig.maxTopupUsd', 'maxUsd={pricingConfig.maxTopupUsd}'],
];

describe('every Desktop credit and Ticket Balance amount field', () => {
  it.each(DESKTOP_SURFACES)('%s refuses an amount over the limit, names the limit, and shows the sales note', (file, comparison, noteLimit) => {
    const source = read(file);
    const at = source.indexOf(comparison);
    expect(at, 'the over-limit check').toBeGreaterThan(-1);
    // The branch taken for an over-limit amount: from the check to the return that ends it.
    const end = source.indexOf('return', at);
    expect(end - at, 'the branch returns straight away').toBeLessThan(260);
    const branch = source.slice(at, source.indexOf(';', end) + 1);
    // Over the limit: an error naming the configured maximum, the note switched on, and nothing bought.
    expect(branch).toContain('creditsLimitMessage(');
    expect(branch).toMatch(/setOverLimit\(true\)/);
    expect(branch).toMatch(/return( false)?;/);
    expect(branch).not.toMatch(/Math\.min|onSelect\(|initiateRazorpay|setIntent\(/);
    // The note is given the same configured maximum — not a number of its own.
    expect(source).toContain(`<CreditsLimitSalesNote ${noteLimit} />`);
    expect(source).toContain('CreditsLimitSalesNote');
  });

  it('no screen carries the $20,000 figure itself: the maximum comes from the pricing configuration', () => {
    for (const [file] of DESKTOP_SURFACES) {
      const source = read(file);
      const hardCoded = source.split('\n').filter((line) => /20[,_]?000/.test(line) && !/^\s*(\/\/|\*)/.test(line) && !/MAX_|AUTONOMOUS_WORK_CREDITS_MAX_USD/.test(line));
      expect(hardCoded, file).toEqual([]);
    }
  });

  it('there is no other place on Desktop that checks a top-up maximum without the note', () => {
    const files = (function walk(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []
      );
    })(path.join(root, 'src/renderer'));
    const checking = files.filter((file) => /> (config|pricingConfig)\.maxTopupUsd|v > max\b/.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(root, file).replace(/\\/g, '/'));
    expect(checking.sort()).toEqual(DESKTOP_SURFACES.map(([file]) => file).sort());
  });
});

describe('the web credits checkout', () => {
  const source = read('pawos-web/src/app/checkout/credits/CreditsCheckoutClient.tsx');

  it('holds an over-limit amount at the configured maximum and says so — the customer is never left thinking they are buying more', () => {
    expect(source).toContain('setOverLimit(requested > pricingConfig.maxTopupUsd)');
    expect(source).toContain('Math.min(pricingConfig.maxTopupUsd');
    expect(source).toMatch(/so the amount has been set to that/);
    expect(source).toContain('pricingConfig.maxTopupUsd.toLocaleString("en-US")');
    // The button shows the amount that will really be charged.
    expect(source).toContain('Continue to payment — $${amountUsd}');
  });

  it("links to PawOS's own sales page, which exists", () => {
    expect(source).toContain('const SALES_CONTACT_PATH = "/support/sales"');
    expect(source).toContain('href={SALES_CONTACT_PATH}');
    expect(fs.existsSync(path.join(root, 'pawos-web/src/app/support/sales/page.tsx'))).toBe(true);
  });

  it('the server refuses an amount over the limit whatever a client sends', () => {
    for (const file of ['pawos-web/src/lib/billing/usageCreditsCrediting.ts', 'pawos-web/src/lib/billing/ticketBalanceCrediting.ts']) {
      expect(read(file), file).toMatch(/if \(amountUsd > maxTopupUsd\) \{\s*return \{ ok: false, status: 400/);
    }
    expect(read('pawos-web/src/lib/billing/razorpay.ts').match(/conversion\.amountUsd > maxTopupUsd\) return \{ ok: false/g)).toHaveLength(2);
  });
});
