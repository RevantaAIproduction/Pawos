import * as fs from 'fs';
import * as path from 'path';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { onFileCreated, onFileModified } from '../../../memory/entities/fileEntities';
import { upsertDocument } from '../../../memory/entities/officeEntities';

/**
 * Document Intelligence's "create a proposal / invoice / project doc" —
 * a real .docx (Word-compatible) file via the docx library, not a plain
 * text file with a .docx extension slapped on. Same overwrite-confirmation
 * discipline as writeFile. The model supplies real content (title +
 * heading/paragraph sections) — this plugin only ever formats what it's
 * given, never invents copy.
 */
export class CreateDocxPlugin extends BasePlugin {
  id = 'createDocx';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'createDocx';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'createDocx') return [];
    if (!request.sections || request.sections.length === 0) {
      return [{ id: 'no-content', message: 'What should this document actually say?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'createDocx') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.outputPath);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const children: Paragraph[] = [];
      if (request.title) children.push(new Paragraph({ text: request.title, heading: HeadingLevel.TITLE }));
      for (const section of request.sections) {
        if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
        for (const para of section.paragraphs) children.push(new Paragraph({ children: [new TextRun(para)] }));
      }

      const doc = new Document({ sections: [{ children }] });
      const buffer = await Packer.toBuffer(doc);
      await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
      await fs.promises.writeFile(request.outputPath, buffer);
      if (exists) onFileModified(request.outputPath);
      else onFileCreated(request.outputPath);
      upsertDocument({ path: request.outputPath, title: request.title, format: 'docx', createdAt: Date.now() });
      return { ok: true, data: { outputPath: request.outputPath, sectionCount: request.sections.length, overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Couldn't create this document: ${(error as Error).message}` };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'createDocx' || !result.ok) return result;
    if (!fs.existsSync(request.outputPath)) {
      return { ok: false, reason: 'failed', message: 'Creating the document reported success but the file is missing.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'createDocx') return 'Working on that…';
    return `Creating ${path.basename(request.outputPath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'createDocx') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `${path.basename(request.outputPath)} already exists. Should I overwrite it?`;
      return describeFailure(result);
    }
    return `Created ${path.basename(request.outputPath)}.`;
  }
}

export const createDocxPlugin = new CreateDocxPlugin();
