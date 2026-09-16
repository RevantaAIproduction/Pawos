import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import type { BuildPdfDocument } from '../../shared/billing/BuildPdfTypes';

export class BuildPdfGenerator {
  static async generate(docData: BuildPdfDocument): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    
    // Embed standard fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Page constraints
    const PAGE_WIDTH = 600;
    const PAGE_HEIGHT = 800;
    const MARGIN = 50;
    const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;
    
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let currentY = PAGE_HEIGHT - MARGIN;
    
    const drawWrappedText = (text: string, font: PDFFont, size: number, x: number, maxWidth: number) => {
      const words = text.split(' ');
      let line = '';
      const lineHeight = size * 1.2;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const textWidth = font.widthOfTextAtSize(testLine, size);
        
        if (textWidth > maxWidth && i > 0) {
          if (currentY < MARGIN + lineHeight) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            currentY = PAGE_HEIGHT - MARGIN;
          }
          page.drawText(line, { x, y: currentY, size, font, color: rgb(0, 0, 0) });
          line = words[i] + ' ';
          currentY -= lineHeight;
        } else {
          line = testLine;
        }
      }
      
      if (line.trim().length > 0) {
        if (currentY < MARGIN + lineHeight) {
          page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          currentY = PAGE_HEIGHT - MARGIN;
        }
        page.drawText(line, { x, y: currentY, size, font, color: rgb(0, 0, 0) });
        currentY -= lineHeight;
      }
    };
    
    // Draw Title
    if (docData.title) {
      drawWrappedText(docData.title, helveticaBold, 24, MARGIN, MAX_WIDTH);
      currentY -= 10;
    }
    
    // Draw Subtitle
    if (docData.subtitle) {
      drawWrappedText(docData.subtitle, helvetica, 16, MARGIN, MAX_WIDTH);
      currentY -= 20;
    }
    
    // Draw Sections
    for (const section of docData.sections) {
      if (section.heading) {
        currentY -= 15;
        drawWrappedText(section.heading, helveticaBold, 14, MARGIN, MAX_WIDTH);
        currentY -= 5;
      }
      
      if (section.paragraphs) {
        for (const para of section.paragraphs) {
          // A naive but functional way to handle basic unicode (like replacing smart quotes if necessary)
          // pdf-lib's standard fonts only support WinAnsi (iso-8859-1).
          // We will map unsupported chars safely or just let pdf-lib throw if it hits them, 
          // but for this phase we stick to plain text.
          const cleanText = para.replace(/[^\x00-\xFF]/g, (char: string) => {
            if (char === '“' || char === '”') return '"';
            if (char === '‘' || char === '’') return "'";
            if (char === '–' || char === '—') return '-';
            return '?';
          });
          drawWrappedText(cleanText, helvetica, 11, MARGIN, MAX_WIDTH);
          currentY -= 8; // para spacing
        }
      }
      
      if (section.bullets) {
        for (const bullet of section.bullets) {
          const cleanBullet = bullet.replace(/[^\x00-\xFF]/g, (char: string) => {
            if (char === '“' || char === '”') return '"';
            if (char === '‘' || char === '’') return "'";
            if (char === '–' || char === '—') return '-';
            return '?';
          });
          const bulletIndent = 15;
          
          if (currentY < MARGIN + 12) {
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            currentY = PAGE_HEIGHT - MARGIN;
          }
          // Draw the bullet point symbol
          page.drawText('•', { x: MARGIN, y: currentY, size: 11, font: helvetica, color: rgb(0, 0, 0) });
          // Draw the wrapped text
          drawWrappedText(cleanBullet, helvetica, 11, MARGIN + bulletIndent, MAX_WIDTH - bulletIndent);
          currentY -= 4; // bullet spacing
        }
        currentY -= 8; // after bullets spacing
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }
}
