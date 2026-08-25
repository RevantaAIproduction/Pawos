import React, { useState } from 'react';
import { assignPersonaForConversation, getPersonaGreeting } from '../../shared/support/SupportPersonas';
import { isSupportRequest, generateSupportGreeting } from '../../shared/support/SupportTrigger';

interface SupportPersonaIndicatorProps {
  conversationId: string;
  userId: string;
  onPersonaAssigned?: (personaName: string) => void;
}

export function SupportPersonaIndicator({
  conversationId,
  userId,
  onPersonaAssigned,
}: SupportPersonaIndicatorProps) {
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const activatePersona = () => {
    const assigned = assignPersonaForConversation(userId, conversationId);
    setPersonaName(assigned);
    onPersonaAssigned?.(assigned);
  };

  if (!personaName) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 12, color: '#666', marginBottom: '12px' }}>
        <button
          onClick={activatePersona}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Connect with support specialist
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '6px',
        marginBottom: '12px',
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#3b82f6' }}>
            {personaName}
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: '2px' }}>
            PawOS AI Support
          </div>
        </div>
        <span style={{ fontSize: 12, color: '#999' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '8px', fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          {generateSupportGreeting(personaName)}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to detect support requests and auto-assign personas.
 */
export function useSupportPersona(conversationId: string, userId: string) {
  const [personaName, setPersonaName] = useState<string | null>(null);

  const checkAndAssignPersona = (message: string): string | null => {
    // If already assigned, don't re-assign
    if (personaName) return personaName;

    // Check if this is a support request
    if (isSupportRequest(message)) {
      const assigned = assignPersonaForConversation(userId, conversationId);
      setPersonaName(assigned);
      return assigned;
    }

    return null;
  };

  return { personaName, checkAndAssignPersona };
}
