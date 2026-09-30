import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const billingUiFiles = [
  'src/renderer/ui/Dashboard/sections/UpgradeSection.tsx',
  'src/renderer/ui/Dashboard/sections/AutonomousCreditsPanel.tsx',
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

  it('Autonomous Work Credits go straight to Razorpay Checkout — no PawOS phone/card form', () => {
    for (const file of [
      'src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx',
      'src/renderer/ui/Dashboard/sections/AutonomousCreditsPanel.tsx',
    ]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('initiateRazorpayCreditsPayment');
      expect(source, file).not.toContain('NativeBillingCheckoutModal');
    }
    const handler = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/ui/Dashboard/sections/CreditsPaymentHandler.ts'), 'utf8');
    expect(handler).toMatch(/razorpay\.open\(\)/);
    // Verification must carry the session token, or pawos-web rejects it and the paid balance is never credited.
    expect(handler).toMatch(/verifyFn\(\{\s*accessToken,/);
  });

  it('Settings shows one Autonomous credits card, not a duplicate', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/renderer/ui/Dashboard/sections/TaskCreditsSection.tsx'))).toBe(false);
    const page = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/ui/Dashboard/sections/BillingSettingsPage.tsx'), 'utf8');
    expect(page).not.toMatch(/<TaskCreditsSection/);
  });
});
