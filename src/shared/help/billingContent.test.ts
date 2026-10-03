import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const articlesDir = path.join(__dirname, 'articles');
const helpText = fs.readdirSync(articlesDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => fs.readFileSync(path.join(articlesDir, f), 'utf8'))
  .join('\n');

describe('desktop help — billing content matches the live customer-facing model', () => {
  it('has no stale placeholders, old caps or multiplier claims', () => {
    for (const stale of [/uncapped/i, /Business Configuration Required/, /being finalized|still being finalized|not yet finalized/i,
      /rolling (usage )?window/i, /5-hour|7-day|\/ 5h|\/ 7d/i, /usage multiples/i, /(5x|20x) the usage/i, /Paw Credits/]) {
      expect(helpText).not.toMatch(stale);
    }
  });

  it('states the locked customer values', () => {
    for (const value of ['$20/month — 2,000 PC', 'weekly limit of 1,000 PC', '$100/month — 10,000 PC', 'weekly limit 5,000 PC',
      '$250/month — 25,000 PC', 'weekly limit 12,500 PC', '$1 per 100 PC', '500 PC every 14 days']) {
      expect(helpText).toContain(value);
    }
  });

  it('never offers mid-month / extra usage to customers', () => {
    for (const hidden of [/extra usage/i, /mid-?month/i, /mid-?cycle/i, /1,500 PC/, /17,500 PC/, /\$15 for/, /\$50 for/, /\$175/]) {
      expect(helpText).not.toMatch(hidden);
    }
  });

  it('never describes private economics', () => {
    expect(helpText.toLowerCase()).not.toMatch(/private allowance|provider cost|micro-?usd|allowance_ratio|token price|reservation/);
  });
});
