import React from 'react';
import { ChartContainer, useChartRange } from './ChartContainer';

/**
 * Layout only — three real categories (Development, Productivity, AI
 * Usage) in reusable containers, sharing one range toggle each. No chart
 * rendering or data wiring yet; instrumentation (files/lines changed,
 * task completion tracking, credit-usage history) doesn't exist in the
 * codebase yet and won't be fabricated here.
 */
export function AnalyticsSection() {
  const [devRange, setDevRange] = useChartRange();
  const [prodRange, setProdRange] = useChartRange();
  const [aiRange, setAiRange] = useChartRange();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <ChartContainer title="Development" range={devRange} onRangeChange={setDevRange} />
      <ChartContainer title="Productivity" range={prodRange} onRangeChange={setProdRange} />
      <ChartContainer title="AI Usage" range={aiRange} onRangeChange={setAiRange} />
    </div>
  );
}
