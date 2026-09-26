import React, { useState } from 'react';
import type { ChatResumeData } from './ConversationTypes';

type ExportResult = { ok: true; filePath: string } | { ok: false; canceled?: boolean; reason?: string };

interface ChatResumeProps {
  resume: ChatResumeData;
  /** Saves the resume as PDF or Word through a Save dialog — the user picks where. */
  onDownload: (format: 'pdf' | 'docx', resume: ChatResumeData) => Promise<ExportResult>;
}

/**
 * A resume PawOS wrote, shown in the chat as a document with a Download button. It is never saved
 * anywhere on its own — only where the user chooses in the Save dialog.
 */
export function ChatResume({ resume, onDownload }: ChatResumeProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<'pdf' | 'docx' | null>(null);

  const download = async (format: 'pdf' | 'docx') => {
    const label = format === 'pdf' ? 'PDF' : 'Word document';
    setSaving(format);
    setStatus(null);
    try {
      const result = await onDownload(format, resume);
      if (result.ok) setStatus(`Saved to ${result.filePath}`);
      else if (!result.canceled) setStatus(`Couldn't save the ${label}: ${result.reason ?? 'unknown error'}`);
    } catch (err) {
      setStatus(`Couldn't save the ${label}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const buttonStyle = (primary: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 8,
    border: primary ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.15)',
    background: primary ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
    color: primary ? 'rgb(147,197,253)' : 'rgba(255,255,255,0.85)',
    fontSize: 12,
    cursor: saving ? 'default' : 'pointer',
  });

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.025)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: 12,
        padding: '16px 18px',
        whiteSpace: 'normal',
      }}
    >
      {resume.sections.map((section, i) => (
        <div key={i} style={{ marginBottom: i === resume.sections.length - 1 ? 0 : 12 }}>
          {section.heading && (
            <div style={{ fontSize: i === 0 ? 18 : 13, fontWeight: 600, marginBottom: 4, color: 'rgba(255,255,255,0.95)' }}>
              {section.heading}
            </div>
          )}
          {section.paragraphs.map((line, j) => (
            <div key={j} style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)' }}>
              {line}
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => void download('pdf')} disabled={saving !== null} style={buttonStyle(true)}>
          {saving === 'pdf' ? 'Saving…' : 'Download PDF'}
        </button>
        <button type="button" onClick={() => void download('docx')} disabled={saving !== null} style={buttonStyle(false)}>
          {saving === 'docx' ? 'Saving…' : 'Download Word'}
        </button>
        {status && (
          <span role="status" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
