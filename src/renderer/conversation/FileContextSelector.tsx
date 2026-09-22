import React, { useState } from 'react';
import { useCurrentFileContext } from '../workspace/useCurrentFileContext';

/**
 * File context selector: Native PawOS composer attachment
 * Renders as compact pill integrated with message composer
 *
 * Modes:
 * - Empty: Path input field
 * - Loading: Loading indicator
 * - Selected: File pill with remove control
 * - Error: Error message
 */

interface FileContextSelectorProps {
  /**
   * Compact mode: renders just the pill (for integration into composer)
   * Full mode: includes input and file preview (standalone/drawer mode)
   */
  mode?: 'compact' | 'full';
}

export function FileContextSelector({ mode = 'full' }: FileContextSelectorProps) {
  const fileContext = useCurrentFileContext();
  const [pathInput, setPathInput] = useState('');

  const handleSelectFile = async () => {
    if (pathInput.trim()) {
      await fileContext.selectFile(pathInput.trim());
      setPathInput('');
    }
  };

  const handleClear = () => {
    fileContext.clearFile();
    setPathInput('');
  };

  // Compact mode: just show the file pill
  if (mode === 'compact') {
    if (!fileContext.currentFile) return null;

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '999px',
        background: 'rgba(77, 167, 255, 0.15)',
        border: '1px solid rgba(77, 167, 255, 0.3)',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.85)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        maxWidth: '280px'
      }}>
        <span style={{ fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", fontSize: '11px', opacity: 0.9 }}>
          📄 {fileContext.currentFile.path.split('/').pop()}
        </span>
        <button
          onClick={handleClear}
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.7)',
            cursor: 'pointer',
            padding: '0',
            fontSize: '14px',
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
          title="Remove file context"
        >
          x
        </button>
      </div>
    );
  }

  // Full mode: input + preview
  return (
    <div style={{
      padding: '12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      fontSize: '13px',
    }}>
      {/* File input row */}
      <div style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="src/components/Button.tsx"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSelectFile()}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.06)',
            fontSize: '13px',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
            outline: 'none'
          }}
          disabled={fileContext.isLoading}
          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'}
        />
        <button
          onClick={handleSelectFile}
          disabled={fileContext.isLoading || !pathInput.trim()}
          type="button"
          style={{
            padding: '8px 12px',
            background: fileContext.isLoading || !pathInput.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
            color: fileContext.isLoading || !pathInput.trim() ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '999px',
            cursor: fileContext.isLoading ? 'wait' : 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => !fileContext.isLoading && !pathInput.trim() ? null : (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
          onMouseOut={(e) => e.currentTarget.style.background = fileContext.isLoading || !pathInput.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}
        >
          {fileContext.isLoading ? '[gear] Loading' : 'Open'}
        </button>
      </div>

      {/* Error display */}
      {fileContext.error && (
        <div style={{
          padding: '8px 10px',
          background: 'rgba(220, 100, 100, 0.1)',
          color: 'rgba(220, 140, 140, 0.9)',
          borderRadius: '8px',
          fontSize: '12px',
          border: '1px solid rgba(220, 100, 100, 0.2)'
        }}>
          Error: {fileContext.error}
        </div>
      )}

      {/* Current file display */}
      {fileContext.currentFile && (
        <div style={{
          padding: '10px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <div style={{
                fontWeight: '600',
                color: 'rgba(255,255,255,0.85)',
                marginBottom: '4px',
                fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                fontSize: '12px'
              }}>
                📄 {fileContext.currentFile.path}
              </div>
              {fileContext.currentFile.language && (
                <div style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.6)',
                  fontWeight: '500'
                }}>
                  {fileContext.currentFile.language}
                </div>
              )}
            </div>
            <button
              onClick={handleClear}
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: '0',
                fontSize: '18px',
                lineHeight: '1',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              title="Remove file"
            >
              x
            </button>
          </div>
          {fileContext.currentFile.content && (
            <pre style={{
              margin: '0',
              padding: '8px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              overflow: 'auto',
              maxHeight: '150px',
              fontSize: '11px',
              lineHeight: '1.4',
              color: 'rgba(255,255,255,0.75)',
              fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
            }}>
              {fileContext.currentFile.content.length > 500
                ? fileContext.currentFile.content.slice(0, 500) + '\n...(truncated)'
                : fileContext.currentFile.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
