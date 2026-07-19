import * as fs from 'fs';
import * as path from 'path';
import PptxGenJS from 'pptxgenjs';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { onFileCreated, onFileModified } from '../../../memory/entities/fileEntities';
import { upsertPresentation } from '../../../memory/entities/officeEntities';

/**
 * Presentation Intelligence's "generate a presentation" — a real .pptx via
 * pptxgenjs: real slides, real speaker notes, a real theme (background/
 * accent color applied to every slide), and real rendered charts
 * (pptxgenjs's own bar/line/pie/doughnut/area chart types) — never a static
 * image pretending to be a chart. Same overwrite-confirmation discipline as
 * writeFile. The model supplies real content; this plugin only formats it.
 */
export class CreatePresentationPlugin extends BasePlugin {
  id = 'createPresentation';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'createPresentation';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'createPresentation') return [];
    if (!request.slides || request.slides.length === 0) {
      return [{ id: 'no-slides', message: 'What should this presentation actually cover?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'createPresentation') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.outputPath);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const pres = new PptxGenJS();
      const primaryColor = request.theme?.primaryColor?.replace('#', '') ?? '2563EB';
      const backgroundColor = request.theme?.backgroundColor?.replace('#', '') ?? 'FFFFFF';

      for (const slideData of request.slides) {
        const slide = pres.addSlide();
        slide.background = { color: backgroundColor };
        if (slideData.title) {
          slide.addText(slideData.title, { x: 0.5, y: 0.3, w: 9, h: 1, fontSize: 28, bold: true, color: primaryColor });
        }
        if (slideData.bullets && slideData.bullets.length > 0) {
          slide.addText(
            slideData.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
            { x: 0.5, y: 1.5, w: 9, h: 4, fontSize: 18, color: '333333' }
          );
        }
        if (slideData.chart) {
          const chartData = slideData.chart.series.map((s) => ({ name: s.name, labels: slideData.chart!.categories, values: s.values }));
          slide.addChart(pres.ChartType[slideData.chart.kind], chartData, { x: 0.5, y: 1.5, w: 9, h: 4 });
        }
        if (slideData.notes) slide.addNotes(slideData.notes);
      }

      await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
      await pres.writeFile({ fileName: request.outputPath });
      if (exists) onFileModified(request.outputPath);
      else onFileCreated(request.outputPath);
      upsertPresentation({ path: request.outputPath, slideCount: request.slides.length, createdAt: Date.now() });
      return { ok: true, data: { outputPath: request.outputPath, slideCount: request.slides.length, overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Couldn't create this presentation: ${(error as Error).message}` };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'createPresentation' || !result.ok) return result;
    if (!fs.existsSync(request.outputPath)) {
      return { ok: false, reason: 'failed', message: 'Creating the presentation reported success but the file is missing.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'createPresentation') return 'Working on that…';
    return `Creating ${path.basename(request.outputPath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'createPresentation') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `${path.basename(request.outputPath)} already exists. Should I overwrite it?`;
      return describeFailure(result);
    }
    const data = result.data as { slideCount: number } | undefined;
    return `Created ${path.basename(request.outputPath)} with ${data?.slideCount} slide(s).`;
  }
}

export const createPresentationPlugin = new CreatePresentationPlugin();
