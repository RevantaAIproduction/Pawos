import React from 'react';
import type { ConversationTaskRecord } from '../../ConversationTypes';

export function TaskDetailView({ task }: { task: ConversationTaskRecord }) {
  const statusColor = {
    running: '#4da7ff',
    completed: '#4de07b',
    failed: '#ff6262',
    interrupted: '#ffa500',
    stopped: '#999',
  }[task.status];

  return (
    <div style={{ padding: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.58)', textTransform: 'uppercase', marginBottom: '4px' }}>Status</div>
        <div style={{ color: statusColor, fontWeight: 700 }}>{task.status.toUpperCase()}</div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.58)', textTransform: 'uppercase', marginBottom: '4px' }}>Goal</div>
        <div>{task.goal}</div>
      </div>

      {task.actions.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.58)', textTransform: 'uppercase', marginBottom: '6px' }}>Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {task.actions.map((action) => (
              <div
                key={action.id}
                style={{
                  padding: '8px',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{action.inProgressText}</div>
                {action.result && <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: '11px' }}>Status: {(action.result as any)?.ok ? 'OK' : 'Failed'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {task.finalReport && (
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.58)', textTransform: 'uppercase', marginBottom: '6px' }}>Report</div>
          <div
            style={{
              padding: '8px',
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: '6px',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {task.finalReport}
          </div>
        </div>
      )}
    </div>
  );
}
