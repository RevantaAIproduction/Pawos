import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import { UsagePieChart } from './AnalyticsSection';

const render = (props: React.ComponentProps<typeof UsagePieChart>) => renderToStaticMarkup(React.createElement(UsagePieChart, props));

describe('Usage page pie chart', () => {
  it('draws one filled wedge per category, labelled Chat/Voice conversation with PC amounts', () => {
    const html = render({
      total: 12,
      aggregates: [
        { category: 'chat', count: 7.5, percent: 62.5 },
        { category: 'voice', count: 3, percent: 25 },
        { category: 'coding', count: 1.5, percent: 12.5 },
      ],
    });
    expect((html.match(/<path /g) ?? []).length).toBe(3);
    expect(html).toContain('Chat conversation');
    expect(html).toContain('Voice conversation');
    expect(html).toContain('7.5 PC');
    expect(html).not.toContain('turns');
  });

  it('a single category is a full pie (filled circle), not an empty ring', () => {
    const html = render({ total: 7.5, aggregates: [{ category: 'chat', count: 7.5, percent: 100 }] });
    expect(html).toMatch(/<circle[^>]*fill="#7c9cff"/);
    expect(html).not.toContain('fill="none"');
  });

  it('the page no longer claims "Unlimited" or a monthly reset', () => {
    const src = fs.readFileSync(path.join(__dirname, 'AnalyticsSection.tsx'), 'utf8');
    expect(src).not.toMatch(/'Unlimited'|unlimited AI conversation|unlimited on every paid plan/);
    expect(src).toContain('<PlanUsageLimits entitlement={entitlement} />');
  });

  it('typed messages are sent as typed, so they are never counted as voice', () => {
    const panel = fs.readFileSync(path.join(__dirname, '../../../conversation/ConversationPanel.tsx'), 'utf8');
    expect(panel).toContain("wasPasted ? 'pasted' : dictated ? undefined : 'typed'");
  });
});
