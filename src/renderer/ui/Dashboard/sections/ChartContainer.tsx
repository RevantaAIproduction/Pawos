import React, { useState } from 'react';
import styles from '../dashboard.module.css';

export type ChartRange = 'hour' | 'day' | 'week' | 'month' | 'year';
const RANGES: { id: ChartRange; label: string }[] = [
  { id: 'hour', label: 'Hour' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

/**
 * Reusable chart shell — title, a shared hour/day/week/month/year range
 * toggle, and a plot area. No charting library wired yet and no data:
 * this is layout-only scaffolding real analytics will render into once
 * that instrumentation exists (files/lines changed, task completion,
 * credit usage over time — none of it tracked today).
 */
export function ChartContainer({
  title,
  range,
  onRangeChange,
  children,
}: {
  title: string;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === range ? styles.rangeChipActive : styles.rangeChip}
              onClick={() => onRangeChange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.chartPlot}>{children ?? <span className={styles.chartPlotEmpty}>Not tracked yet</span>}</div>
    </div>
  );
}

export function useChartRange(initial: ChartRange = 'day') {
  return useState<ChartRange>(initial);
}
