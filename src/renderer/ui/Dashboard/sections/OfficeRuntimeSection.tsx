import React from 'react';
import { OfficeIcon } from '../NavIcons';
import { RuntimeLandingSection } from './RuntimeLandingSection';

export function OfficeRuntimeSection() {
  return (
    <RuntimeLandingSection
      icon={<OfficeIcon />}
      description="Paw creates, edits, and analyzes real documents, spreadsheets, and presentations directly on your files — no separate app to open."
      capabilities={[
        { title: 'Documents', body: 'Create, merge, summarize, compare, and extract from Word documents and PDFs.' },
        { title: 'Spreadsheets', body: 'Build, edit, and analyze spreadsheets — formulas, data cleanup, and reports.' },
        { title: 'Presentations', body: 'Generate and edit slide decks from an outline, a document, or a request.' },
        { title: 'Email drafting', body: 'Draft and preview follow-up emails for you to review before sending — Paw never sends on its own.' },
      ]}
      quickStarts={[
        { label: 'Summarize a PDF', prefill: 'Summarize a PDF for me — I’ll tell you which one.' },
        { label: 'Build a spreadsheet', prefill: 'Help me build a spreadsheet to track something.' },
        { label: 'Create a slide deck', prefill: 'Create a presentation from an outline I’ll give you.' },
      ]}
    />
  );
}
