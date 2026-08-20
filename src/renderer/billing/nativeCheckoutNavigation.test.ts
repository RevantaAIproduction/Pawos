import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const billingUiFiles = [
  'src/renderer/ui/Dashboard/sections/UpgradeSection.tsx',
  'src/renderer/ui/Dashboard/sections/TaskCreditsSection.tsx',
  'src/renderer/ui/Dashboard/sections/AutonomousTaskBillingCard.tsx',
  'src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx',
];

describe('native billing checkout navigation', () => {
  it('does not open hosted Revanta checkout pages from billing UI entry points', () => {
    for (const file of billingUiFiles) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/checkoutUrl/);
      expect(source, file).not.toMatch(/billingStartCheckoutSync/);
      expect(source, file).not.toMatch(/billingCreateCreditsCheckoutSession/);
      expect(source, file).not.toMatch(/actionExecute\(\{\s*type:\s*['"]openUrl['"]/);
      expect(source, file).not.toMatch(/revantaai\.com\/(?:pricing|checkout)/);
    }
  });
});
