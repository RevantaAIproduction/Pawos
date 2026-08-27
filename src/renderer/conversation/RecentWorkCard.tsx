import React, { useState } from 'react';

export function RecentWorkCard({
  onClose,
  tasks = [
    { icon: '✓', title: 'Changes applied', status: 'done' },
    { icon: '✓', title: 'Tests completed', status: 'done' },
    { icon: '●', title: 'Validation running', status: 'running' },
  ],
}: {
  onClose?: () => void;
  tasks?: Array<{ icon: string; title: string; status: string }>;
}) {
  const [hoveredTaskId, setHoveredTaskId] = useState<number | null>(null);
  const timeAgo = '2 min ago';

  return (
    <div
      style={{
        backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.03)',
        border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
        borderRadius: '8px',
        padding: '16px',
        position: 'relative',
        marginBottom: 12,
      }}
    >
      {/* X Close Button */}
      <button
        type="button"
        onClick={onClose}
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
          transition: 'all 0.2s ease',
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

      {/* Title Section */}
      <div style={{ marginBottom: 16, paddingRight: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.9)' }}>
          ✓ Building...
        </div>
        <div style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginTop: 4 }}>
          Close button added
        </div>
      </div>

      {/* Recent Work Header with Divider */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.7)' }}>Recent work</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)' }} />
        </div>
      </div>

      {/* Task List */}
      <div style={{ marginBottom: 16 }}>
        {tasks.map((task, idx) => (
          <div
            key={idx}
            onMouseEnter={() => setHoveredTaskId(idx)}
            onMouseLeave={() => setHoveredTaskId(null)}
            style={{
              padding: '8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <span style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>{task.icon}</span>
            <span style={{ fontSize: 12, color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>{task.title}</span>

            {/* Hover Actions - Hidden by default */}
            {hoveredTaskId === idx && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
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
            )}
          </div>
        ))}
      </div>

      {/* Time indicator - right aligned */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'rgba(var(--pawos-overlay-rgb), 0.5)' }}>{timeAgo}</span>
      </div>
    </div>
  );
}
