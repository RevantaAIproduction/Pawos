import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../services/ipc/ipcBridgeImplementation', () => ({ ipc: { actionExecute: vi.fn(async () => ({ ok: true })) } }));

import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { CreditsLimitSalesNote, SALES_CONTACT_URL, creditsLimitMessage } from './CreditsLimitSalesNote';

/**
 * A credits purchase over the per-transaction maximum: the customer is told the limit and pointed to
 * sales. Nothing here raises the limit, splits a purchase, or changes what is bought.
 */
describe('the note under a credits amount that is over the limit', () => {
  it('says what the limit is and that larger needs go to Revanta AI sales', () => {
    const html = renderToStaticMarkup(React.createElement(CreditsLimitSalesNote, { maxUsd: 20000 }));
    expect(html).toContain('One purchase can add up to $20,000.');
    expect(html).toContain('For larger credit requirements, contact Revanta AI sales.');
    expect(html).toContain('Contact sales');
    expect(html).toContain('data-testid="credits-limit-contact-sales"');
  });

  it('follows the limit it is given, not a number of its own', () => {
    expect(creditsLimitMessage(5000)).toBe('One purchase can add up to $5,000.');
    expect(renderToStaticMarkup(React.createElement(CreditsLimitSalesNote, { maxUsd: 5000 }))).not.toContain('20,000');
  });

  it("points at PawOS's own sales page on the official domain", () => {
    expect(SALES_CONTACT_URL).toBe('https://pawos.revantaai.com/support/sales');
  });

  it('the link only opens that page — it starts no purchase', () => {
    const element = CreditsLimitSalesNote({ maxUsd: 20000 }) as React.ReactElement<{ children: React.ReactNode[] }>;
    const span = element.props.children[1] as React.ReactElement<{ children: React.ReactNode[] }>;
    const button = span.props.children.find((child) => React.isValidElement(child) && child.type === 'button') as React.ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    expect(ipc.actionExecute).toHaveBeenCalledTimes(1);
    expect(ipc.actionExecute).toHaveBeenCalledWith({ type: 'openUrl', url: SALES_CONTACT_URL });
  });

  it('says nothing about prices, conversion or splitting a purchase', () => {
    const html = renderToStaticMarkup(React.createElement(CreditsLimitSalesNote, { maxUsd: 20000 })).toLowerCase();
    expect(html).not.toMatch(/split|several payments|per pc|allowance|provider/);
  });
});
