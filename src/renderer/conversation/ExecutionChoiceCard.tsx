import React, { useState } from 'react';

export interface ExecutionChoiceCardProps {
  understanding: string;
  onWorkWithMe: () => void;
  onAutonomous: () => void;
  onCancel: () => void;
}

/**
 * ExecutionChoiceCard
 *
 * Renders an inline choice card in the conversation for actionable requests.
 * Asks the user: "How would you like to continue?"
 * with two options: "Work with me" or "Do it autonomously"
 *
 * Designed to feel like a natural PawOS conversational element, not a settings dialog.
 */
export function ExecutionChoiceCard({
  understanding,
  onWorkWithMe,
  onAutonomous,
  onCancel,
}: ExecutionChoiceCardProps) {
  const [selectedChoice, setSelectedChoice] = useState<'work_with_me' | 'autonomous' | null>(null);

  const handleWorkWithMe = () => {
    if (selectedChoice) return; // Already selected
    setSelectedChoice('work_with_me');
    onWorkWithMe();
  };

  const handleAutonomous = () => {
    if (selectedChoice) return; // Already selected
    setSelectedChoice('autonomous');
    onAutonomous();
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div
      style={{
        background: 'rgba(77, 167, 255, 0.05)',
        border: '1px solid rgba(77, 167, 255, 0.15)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Understanding summary */}
      {understanding && (
        <div
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.7)',
            lineHeight: '1.5',
            marginBottom: '12px',
          }}
        >
          {understanding}
        </div>
      )}

      {/* Choice heading */}
      <div
        style={{
          fontSize: '13px',
          fontWeight: '600',
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '12px',
          marginTop: understanding ? '0px' : '0px',
        }}
      >
        How would you like to continue?
      </div>

      {/* Choice buttons */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexDirection: 'column',
        }}
      >
        {/* Work with me button */}
        <button
          onClick={handleWorkWithMe}
          disabled={selectedChoice !== null}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '10px 12px',
            background:
              selectedChoice === 'work_with_me'
                ? 'rgba(76, 175, 80, 0.15)'
                : selectedChoice === null
                  ? 'rgba(77, 167, 255, 0.12)'
                  : 'rgba(77, 167, 255, 0.05)',
            border:
              selectedChoice === 'work_with_me'
                ? '1px solid rgba(76, 175, 80, 0.3)'
                : selectedChoice === null
                  ? '1px solid rgba(77, 167, 255, 0.2)'
                  : '1px solid rgba(77, 167, 255, 0.1)',
            borderRadius: '6px',
            cursor: selectedChoice === null ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
            opacity: selectedChoice === null || selectedChoice === 'work_with_me' ? 1 : 0.5,
            textAlign: 'left',
          }}
          onMouseOver={(e) => {
            if (selectedChoice === null) {
              e.currentTarget.style.background = 'rgba(77, 167, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.3)';
            }
          }}
          onMouseOut={(e) => {
            if (selectedChoice === null) {
              e.currentTarget.style.background = 'rgba(77, 167, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.2)';
            }
          }}
          type="button"
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color:
                selectedChoice === 'work_with_me'
                  ? 'rgba(76, 175, 80, 0.9)'
                  : 'rgba(77, 167, 255, 0.85)',
              marginBottom: '2px',
            }}
          >
            {selectedChoice === 'work_with_me' ? '[done] ' : ''}Work with me
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Build and refine it together
          </div>
        </button>

        {/* Do it autonomously button */}
        <button
          onClick={handleAutonomous}
          disabled={selectedChoice !== null}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '10px 12px',
            background:
              selectedChoice === 'autonomous'
                ? 'rgba(255, 152, 0, 0.15)'
                : selectedChoice === null
                  ? 'rgba(77, 167, 255, 0.12)'
                  : 'rgba(77, 167, 255, 0.05)',
            border:
              selectedChoice === 'autonomous'
                ? '1px solid rgba(255, 152, 0, 0.3)'
                : selectedChoice === null
                  ? '1px solid rgba(77, 167, 255, 0.2)'
                  : '1px solid rgba(77, 167, 255, 0.1)',
            borderRadius: '6px',
            cursor: selectedChoice === null ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
            opacity: selectedChoice === null || selectedChoice === 'autonomous' ? 1 : 0.5,
            textAlign: 'left',
          }}
          onMouseOver={(e) => {
            if (selectedChoice === null) {
              e.currentTarget.style.background = 'rgba(77, 167, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.3)';
            }
          }}
          onMouseOut={(e) => {
            if (selectedChoice === null) {
              e.currentTarget.style.background = 'rgba(77, 167, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.2)';
            }
          }}
          type="button"
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color:
                selectedChoice === 'autonomous'
                  ? 'rgba(255, 152, 0, 0.9)'
                  : 'rgba(77, 167, 255, 0.85)',
              marginBottom: '2px',
            }}
          >
            {selectedChoice === 'autonomous' ? '[done] ' : ''}Do it autonomously
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Plan, execute, test, and complete it
          </div>
        </button>
      </div>

      {/* Cancel button (small) */}
      {selectedChoice === null && (
        <button
          onClick={handleCancel}
          style={{
            marginTop: '8px',
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
          }}
          type="button"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
