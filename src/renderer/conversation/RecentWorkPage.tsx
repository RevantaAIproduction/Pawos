import React, { useState } from 'react';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

export function RecentWorkPage({
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
  const [showRecentWork, setShowRecentWork] = useState(true);

  const recentTasks = [
    { icon: '✓', title: 'Changes applied', status: 'done' },
    { icon: '✓', title: 'Tests completed', status: 'done' },
    { icon: '●', title: 'Validation running', status: 'running' },
  ];

  const timeAgo = '2 min ago';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
        padding: '16px',
        gap: 16,
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

      {/* Usage Card - Shows when work started */}
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
            <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 4 }}>5-Hour Limit</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)' }}>
              {entitlement?.usage5hPc ?? 0} / {entitlement?.limit5hPc ?? 0} PC
            </div>
            <div
              style={{
                height: '4px',
                backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.1)',
                borderRadius: '2px',
                marginTop: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  width: `${Math.min(100, ((entitlement?.usage5hPc ?? 0) / (entitlement?.limit5hPc ?? 1)) * 100)}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* 7-Day Limit */}
          <div>
            <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 4 }}>7-Day Limit</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)' }}>
              {entitlement?.usageWeeklyPc ?? 0} / {entitlement?.limitWeeklyPc ?? 0} PC
            </div>
            <div
              style={{
                height: '4px',
                backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.1)',
                borderRadius: '2px',
                marginTop: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  backgroundColor: '#10b981',
                  width: `${Math.min(100, ((entitlement?.usageWeeklyPc ?? 0) / (entitlement?.limitWeeklyPc ?? 1)) * 100)}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Work Section */}
      {showRecentWork && (
        <div
          style={{
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.03)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
            borderRadius: '8px',
            padding: '16px',
            position: 'relative',
          }}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setShowRecentWork(false)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 14,
              color: 'rgba(var(--pawos-overlay-rgb), 0.5)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.1)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(var(--pawos-overlay-rgb), 0.8)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'rgba(var(--pawos-overlay-rgb), 0.5)';
            }}
          >
            ×
          </button>

          {/* Title */}
          <div style={{ marginBottom: 16, paddingRight: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)' }}>✓ Building...</div>
            <div style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginTop: 4 }}>Close button added</div>
          </div>

          {/* Recent Work Header */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.7)' }}>Recent work</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)' }} />
            </div>
          </div>

          {/* Task List */}
          <div style={{ marginBottom: 16 }}>
            {recentTasks.map((task, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>{task.icon}</span>
                <span style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>{task.title}</span>

                {/* Hover Actions */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', opacity: 0, transition: 'opacity 0.2s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                >
                  <button
                    type="button"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: 'rgba(var(--pawos-overlay-rgb), 0.7)',
                    }}
                    title="PR"
                  >
                    PR
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: 'rgba(var(--pawos-overlay-rgb), 0.7)',
                    }}
                    title="main branch"
                  >
                    main
                  </button>
                  <span style={{ fontSize: 9, color: 'rgba(var(--pawos-overlay-rgb), 0.5)' }}>+3 -1</span>
                  <button
                    type="button"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: 'rgba(var(--pawos-overlay-rgb), 0.7)',
                    }}
                    title="Copy"
                  >
                    📋
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: 10,
                      color: 'rgba(var(--pawos-overlay-rgb), 0.7)',
                    }}
                    title="Pin"
                  >
                    📌
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Time Indicator */}
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: 'rgba(var(--pawos-overlay-rgb), 0.5)' }}>{timeAgo}</span>
          </div>
        </div>
      )}
    </div>
  );
}
