import React, { useState } from 'react';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

export function InitialPage({
  onNewChat,
  entitlement,
  activePawModel,
  usageCompute = 0,
  usageTimestamp,
}: {
  onNewChat?: () => void;
  entitlement?: EntitlementSnapshot | null;
  activePawModel?: PawModelId;
  usageCompute?: number;
  usageTimestamp?: number;
}) {
  const [showRecentWork, setShowRecentWork] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        padding: '16px',
        gap: 16,
        overflowY: 'auto',
        backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
      }}
    >
        {/* Top: New Chat Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onNewChat}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: '#3b82f6',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)')}
          >
            + New Chat
          </button>
        </div>

        {/* Usage Card - Same as RecentWorkPage */}
        <div
          style={{
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.05)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.15)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 8 }}>
            Current Usage
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* 5-Hour Limit */}
            <div>
              <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 8 }}>
                Plan usage limits - {entitlement?.tier === 'team'
                  ? `TEAM ${entitlement?.seatTier?.toUpperCase() ?? 'STANDARD'}`
                  : entitlement?.tier === 'proMax'
                  ? `PRO MAX ${entitlement?.proMaxVariant?.toUpperCase() ?? '5X'}`
                  : entitlement?.tier?.toUpperCase() ?? 'GO'}
                {(entitlement?.tier === 'team' || entitlement?.tier === 'enterprise') && ' (pooled)'}
              </div>
              {entitlement?.limit5hPc && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)', marginBottom: 12 }}>
                  <div style={{ marginBottom: 4, fontWeight: 400, fontSize: 10 }}>5-hour limit</div>
                  <div>{`Resets in ${Math.floor((5 * 60 * 60 * 1000 - ((Date.now() - (entitlement?.activeWindowStartAt ?? Date.now())) % (5 * 60 * 60 * 1000))) / (60 * 1000))} min ${Math.round(((entitlement?.usage5hPc ?? 0) / (entitlement?.limit5hPc ?? 1)) * 100)}%`}</div>
                </div>
              )}
              {entitlement?.activeHoursWeekly !== null && entitlement?.activeHoursWeekly > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)' }}>
                  <div style={{ marginBottom: 4, fontWeight: 400, fontSize: 10 }}>Weekly · all models</div>
                  <div>{(() => {
                    const hoursUsed = entitlement?.activeHoursUsed7d ?? 0;
                    const hoursLimit = entitlement?.activeHoursWeekly ?? 0;
                    const percentage = hoursLimit > 0 ? (hoursUsed / hoursLimit) * 100 : 0;
                    if (percentage < 100) return `${Math.round(percentage)}% (${Math.round(hoursUsed * 10) / 10}/${hoursLimit}h)`;
                    const cycleStartMs = entitlement?.weeklyCycleStartAt ?? Date.now();
                    const weekEndMs = cycleStartMs + (7 * 24 * 60 * 60 * 1000);
                    const resetDate = new Date(weekEndMs);
                    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const resetDay = daysOfWeek[resetDate.getDay()];
                    const resetHour = resetDate.getHours().toString().padStart(2, '0');
                    const resetMin = resetDate.getMinutes().toString().padStart(2, '0');
                    const ampm = resetDate.getHours() >= 12 ? 'PM' : 'AM';
                    return `100% (${Math.round(hoursUsed * 10) / 10}/${hoursLimit}h) Resets ${resetDay} ${resetHour}:${resetMin} ${ampm}`;
                  })()}</div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Welcome Message */}
        <div
          style={{
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.03)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)', marginBottom: 8 }}>
            🐾 Welcome to PawOS
          </div>
          <div style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.6)' }}>
            Start a new task to see your recent work and progress
          </div>
        </div>
      </div>
    );
}
