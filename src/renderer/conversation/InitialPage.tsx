import React, { useState } from 'react';
import { AdminTestTierPanel } from '../ui/admin/AdminTestTierPanel';
import type { EntitlementSnapshot, PawModelId } from '../../shared/billing/BillingTypes';

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
        backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
        gap: 0,
      }}
    >
      {/* Left Sidebar - Admin Panel (only for authorized admins) */}
      <div
        style={{
          width: '320px',
          borderRight: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.02)',
        }}
      >
        <AdminTestTierPanel />
      </div>

      {/* Right Content - Main Page */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: 16,
          overflowY: 'auto',
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
                {entitlement?.usage7dPc ?? 0} / {entitlement?.limit7dPc ?? 0} PC
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
                    width: `${Math.min(100, ((entitlement?.usage7dPc ?? 0) / (entitlement?.limit7dPc ?? 1)) * 100)}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
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
    </div>
  );
}
