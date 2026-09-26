import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { BuildPdfDocument } from '../../shared/billing/BuildPdfTypes';

/**
 * A resume (or any career document) as a real Word .docx — same document shape the PDF export uses:
 * title (the person's name), subtitle (contact line), then headed sections of lines. Built in memory;
 * the caller writes it only where the user chose in the Save dialog.
 */
export async function buildResumeDocx(doc: BuildPdfDocument): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: doc.title, bold: true, size: 36 })],
    }),
  ];
  if (doc.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: doc.subtitle, size: 20, color: '555555' })],
      })
    );
  }
  for (const section of doc.sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 2 } },
          children: [new TextRun({ text: section.heading, bold: true, size: 24 })],
        })
      );
    }
    for (const line of section.paragraphs ?? []) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, size: 21 })] }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: bullet, size: 21 })] }));
    }
  }
  const document = new Document({ title: doc.title, sections: [{ children }] });
  return Packer.toBuffer(document);
}
