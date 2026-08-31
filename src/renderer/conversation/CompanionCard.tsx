import React, { useState } from 'react';
import type { EntitlementSnapshot, SubscriptionTierId, SeatTier } from '../../shared/billing/BillingTypes';
import type { PawModelId } from '../../shared/ai/PawModelTypes';
import { DEFAULT_PAW_MODEL_ID, REASONING_PAW_MODEL_IDS, getPawModel } from '../../shared/ai/PawModelTypes';

const COMPANION_MODEL_ORDER: PawModelId[] = ['paw-fable', 'paw-core', 'paw-swift', 'paw-flash'];

export function CompanionCard({
  activePawModel = DEFAULT_PAW_MODEL_ID,
  onSelectModel,
  entitlement,
  pawCreditsBalanceUsd = 0,
  onBuyCredits,
  onSpeech,
  onStopSpeech,
  isSpeaking = false,
  usageCompute = 0,
  usageTimestamp,
  onShowDetailedBreakdown,
  currentWorkingFile,
  onConnectMicrophone,
  modelTierRequirements,
}: {
  activePawModel?: PawModelId;
  onSelectModel?: (id: PawModelId) => void;
  entitlement?: EntitlementSnapshot | null;
  pawCreditsBalanceUsd?: number;
  onBuyCredits?: () => void;
  onSpeech?: () => void;
  onStopSpeech?: () => void;
  isSpeaking?: boolean;
  usageCompute?: number;
  usageTimestamp?: number;
  onShowDetailedBreakdown?: () => void;
  currentWorkingFile?: string;
  onConnectMicrophone?: () => void;
  modelTierRequirements?: Partial<Record<PawModelId, SubscriptionTierId>>;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [modelsMenuOpen, setModelsMenuOpen] = useState(false);
  const [usageMenuOpen, setUsageMenuOpen] = useState(false);
  const [editsModeMenuOpen, setEditsModeMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editsMode, setEditsMode] = useState<'manual' | 'auto' | 'plan'>('manual');
  const [recentTasks, setRecentTasks] = useState([
    {
      id: 'task-1',
      icon: '✓',
      title: 'Building... Close button added',
      meta: 'Compacted conversation · saved 188.5k tokens',
      timestamp: Date.now() - 2 * 60 * 1000, // 2 min ago
    },
  ]);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handleSendSearch = () => {
    if (searchQuery.trim()) {
      console.log('Submitting search:', searchQuery);
      // TODO: Wire to actual search/submit handler
      setSearchQuery('');
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = () => {
    photoInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files?.length) {
      console.log('Files selected:', Array.from(files).map(f => f.name));
      // TODO: Wire to actual file upload handler
    }
  };

  const handleEditsModeChange = (mode: 'manual' | 'auto' | 'plan') => {
    setEditsMode(mode);
    console.log('Edits mode changed to:', mode);
    // TODO: Save preference to localStorage or backend
    localStorage.setItem('editsMode', mode);
  };

  const activePawModelDescriptor = getPawModel(activePawModel ?? DEFAULT_PAW_MODEL_ID);
  const tier = entitlement?.tier ?? 'go';
  const renderedModels = COMPANION_MODEL_ORDER.filter((id) => REASONING_PAW_MODEL_IDS.includes(id));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px',
        backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
        position: 'relative',
      }}
    >
      {/* Close Button */}
      <button
        type="button"
        onClick={() => {
          console.log('Companion Card closed');
          // TODO: Wire to actual close handler
        }}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '4px 8px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: 14,
          color: 'rgba(var(--pawos-overlay-rgb), 0.6)',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 28,
          minHeight: 28,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.1)';
          (e.currentTarget as HTMLElement).style.color = 'rgba(var(--pawos-overlay-rgb), 0.8)';
          const label = (e.currentTarget.querySelector('[data-label]') as HTMLElement);
          if (label) label.style.display = 'inline';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'rgba(var(--pawos-overlay-rgb), 0.6)';
          const label = (e.currentTarget.querySelector('[data-label]') as HTMLElement);
          if (label) label.style.display = 'none';
        }}
      >
        <span style={{ fontSize: 16 }}>×</span>
        <span
          data-label
          style={{
            display: 'none',
            marginLeft: 6,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          close
        </span>
      </button>
      {/* Row 1: Project Context (Local | PawOS | main | worktree) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '8px 0' }}>
        <button
          type="button"
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
            borderRadius: '4px',
            color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          📁 Local
        </button>
        {currentWorkingFile && (
          <button
            type="button"
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
              borderRadius: '4px',
              color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              maxWidth: 150,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`Recent: ${currentWorkingFile}`}
          >
            🔗 {currentWorkingFile}
          </button>
        )}
        <button
          type="button"
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
            borderRadius: '4px',
            color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          ⎇ main
        </button>
        <button
          type="button"
          style={{
            padding: '4px 8px',
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
            borderRadius: '4px',
            color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          🌳 worktree
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Row 2: Search Bar with integrated buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
        {/* Send Button Left */}
        <button
          type="button"
          onClick={handleSendSearch}
          disabled={!searchQuery.trim()}
          style={{
            padding: '8px 12px',
            backgroundColor: searchQuery.trim() ? 'rgba(59, 130, 246, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
            fontSize: 14,
            color: searchQuery.trim() ? '#3b82f6' : 'rgba(var(--pawos-overlay-rgb), 0.4)',
            opacity: searchQuery.trim() ? 1 : 0.5,
          }}
        >
          ➤
        </button>

        {/* Long Search Bar */}
        <input
          type="text"
          placeholder="Type or describe what you need..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 12,
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.05)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.15)',
            borderRadius: '6px',
            color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(var(--pawos-overlay-rgb), 0.3)';
            e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(var(--pawos-overlay-rgb), 0.15)';
            e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.05)';
          }}
        />

        {/* Voice Button Right */}
        <button
          type="button"
          onClick={onSpeech}
          style={{
            padding: '8px 12px',
            backgroundColor: isSpeaking ? 'rgba(239, 68, 68, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.15)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: 14,
            color: isSpeaking ? '#ef4444' : 'inherit',
          }}
        >
          🎤
        </button>

        {/* Resume Button Right */}
        <button
          type="button"
          onClick={onSpeech}
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ▶️
        </button>
      </div>

      {/* Row 3: Accept edits (LEFT) | Models & Usage (RIGHT) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0' }}>
        {/* Left: Accept edits dropdown + Add menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Accept Edits Mode Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setEditsModeMenuOpen(!editsModeMenuOpen)}
              style={{
                padding: '6px 10px',
                backgroundColor: 'transparent',
                border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                borderRadius: '4px',
                color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Accept edits
              <span style={{ fontSize: 10 }}>{editsModeMenuOpen ? '▴' : '▾'}</span>
            </button>
            {editsModeMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  marginBottom: 4,
                  backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
                  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 20,
                  minWidth: 240,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    handleEditsModeChange('manual');
                    setEditsModeMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: editsMode === 'manual' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'manual' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'manual' ? 'rgba(59, 130, 246, 0.1)' : 'transparent')}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Manual {editsMode === 'manual' && '✓'}</div>
                    <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.5)', marginTop: 2 }}>Always ask before making changes</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleEditsModeChange('auto');
                    setEditsModeMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: editsMode === 'auto' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'auto' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'auto' ? 'rgba(59, 130, 246, 0.1)' : 'transparent')}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Accept edits {editsMode === 'auto' && '✓'}</div>
                    <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.5)', marginTop: 2 }}>Automatically accept all file edits</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleEditsModeChange('plan');
                    setEditsModeMenuOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: editsMode === 'plan' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'plan' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = editsMode === 'plan' ? 'rgba(59, 130, 246, 0.1)' : 'transparent')}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Plan {editsMode === 'plan' && '✓'}</div>
                    <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.5)', marginTop: 2 }}>Create a plan before making changes</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* + Menu: Add files, photos, slash commands, connectors, plugins */}
          <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            +
          </button>
          {addMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
                border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 20,
                minWidth: 160,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  handleFileUpload();
                  setAddMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                📁 Add Files
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePhotoUpload();
                  setAddMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🖼️ Add Photos
              </button>
              <button
                type="button"
                onClick={() => setAddMenuOpen(false)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                / Slash Commands
              </button>
              <button
                type="button"
                onClick={() => setAddMenuOpen(false)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                  borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🔌 Connectors
              </button>
              <button
                type="button"
                onClick={() => setAddMenuOpen(false)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🔌 Plugins
              </button>
            </div>
          )}
        </div>
        </div>

        {/* Right: Models & Usage Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Models Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setModelsMenuOpen(!modelsMenuOpen)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            🤖 Models
          </button>
          {modelsMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
                border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 20,
                minWidth: 140,
              }}
            >
              {renderedModels.map((modelId) => {
                const model = getPawModel(modelId);
                const isSelected = modelId === activePawModel;
                return (
                  <button
                    key={modelId}
                    type="button"
                    onClick={() => {
                      onSelectModel?.(modelId);
                      setModelsMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      textAlign: 'left',
                      color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(var(--pawos-overlay-rgb), 0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent')}
                  >
                    {model.label} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Usage Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setUsageMenuOpen(!usageMenuOpen)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.15)',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.25)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            📊 Usage
          </button>
          {usageMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
                border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 20,
                minWidth: 180,
                padding: '12px',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 8 }}>5-Hour Limit</div>
              <div style={{ fontSize: 11, color: 'rgba(var(--pawos-overlay-rgb), 0.8)', marginBottom: 8 }}>
                {entitlement?.usage5hPc ?? 0} / {entitlement?.limit5hPc ?? 0} PC ({Math.round(((entitlement?.usage5hPc ?? 0) / (entitlement?.limit5hPc ?? 1)) * 100)}%)
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(var(--pawos-overlay-rgb), 0.6)', marginBottom: 8, marginTop: 8 }}>7-Day Limit</div>
              <div style={{ fontSize: 11, color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>
                {entitlement?.usageWeeklyPc ?? 0} / {entitlement?.limitWeeklyPc ?? 0} PC ({Math.round(((entitlement?.usageWeeklyPc ?? 0) / (entitlement?.limitWeeklyPc ?? 1)) * 100)}%)
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
