import React from 'react';

export interface CreditUsageProps {
  label?: string;
  used: number;
  remaining: number;
  compact?: boolean;
  showRemaining?: boolean;
}

/**
 * Reusable credit usage display component — shows used/remaining/percentage
 * with a progress bar, consistent across Companion Card, Dashboard, and org surfaces.
 * Mimics Claude Code's token usage presentation.
 */
export function CreditUsageDisplay({
  label = 'Credits',
  used,
  remaining,
  compact = false,
  showRemaining = true,
}: CreditUsageProps) {
  const total = used + remaining;
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

  // Color based on usage: green → yellow → red
  const barColor =
    percentage <= 70 ? '#64dc78' : // green
    percentage <= 90 ? '#f1d000' : // yellow
    '#e08c8c'; // red

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#96969e', marginBottom: 4 }}>{label}</div>
          <div
            style={{
              height: 4,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percentage}%`,
                background: barColor,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>
            {percentage}% · {used.toLocaleString()} used
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          height: 6,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: barColor,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: '#96969e', fontVariantNumeric: 'tabular-nums' }}>
        <span>{percentage}%</span>
        <span>{used.toLocaleString()} used</span>
        {showRemaining && remaining >= 0 && (
          <span>{remaining.toLocaleString()} remaining</span>
        )}
      </div>
    </div>
  );
}
