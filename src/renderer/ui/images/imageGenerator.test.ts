import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../services/ipc/ipcBridgeImplementation', () => ({ ipc: { imagesGetAllowance: vi.fn(), imagesGenerate: vi.fn(), imagesSave: vi.fn() } }));
vi.mock('../../auth/supabaseClient', () => ({ getSupabaseClient: vi.fn() }));

import { GeneratedImageFrame, ImageGeneratorDialog, zoomOnEvent } from './ImageGeneratorDialog';
import { imageChargedLine, imagePriceLine, nextImageRequestId } from './imageGeneratorText';

/** The Desktop image dialog: the price it shows comes from the server, and a retry never makes a second image. */
describe('what an image costs, in words', () => {
  it('Paw Go: the free images left, then purchased credits at the server price', () => {
    expect(imagePriceLine({ funding: 'free_then_credits', chargePc: 9.7, freeImagesLeft: 3 })).toBe('Free — 3 of 3 free images left.');
    expect(imagePriceLine({ funding: 'free_then_credits', chargePc: 9.7, freeImagesLeft: 0 })).toBe('Uses 9.7 PC of your purchased credits.');
  });

  it('paid plans: 9.7 PC of the plan; Enterprise: one unit of the shared pool', () => {
    expect(imagePriceLine({ funding: 'buckets', chargePc: 9.7, freeImagesLeft: null })).toBe("Uses 9.7 PC of your plan's usage.");
    expect(imagePriceLine({ funding: 'organization', chargePc: 9.7, freeImagesLeft: null })).toBe("Uses 1 unit of your organization's shared monthly usage.");
    expect(imagePriceLine(null)).toBe('Checking the price…');
  });

  it('what a finished image cost', () => {
    expect(imageChargedLine({ funding: 'free', chargedPc: 0 })).toBe('Free image — no usage charged.');
    expect(imageChargedLine({ funding: 'bucket', chargedPc: 9.7 })).toBe('Used 9.7 PC.');
    expect(imageChargedLine({ funding: 'organization', chargedPc: 0 })).toBe("Used 1 unit of your organization's shared usage.");
  });
});

describe('the request id a Generate press sends', () => {
  const make = vi.fn(() => 'fresh-request-id');
  it('re-sends the same id after no answer, so a retry cannot make or charge a second image', () => {
    expect(nextImageRequestId('first-request', { ok: false, answered: false, code: 'unreachable', message: '' }, make)).toBe('first-request');
  });
  it('starts a new request after any answer — an image, a refusal, or no allowance', () => {
    expect(nextImageRequestId('first-request', { ok: false, answered: true, code: 'free_images_used', message: '' }, make)).toBe('fresh-request-id');
    expect(nextImageRequestId('first-request', { ok: true, image: {} as never }, make)).toBe('fresh-request-id');
    expect(nextImageRequestId(null, null, make)).toBe('fresh-request-id');
  });
});

describe('the dialog', () => {
  it('opens with the prompt from the composer, the ratios, a price line and Generate', () => {
    const html = renderToStaticMarkup(React.createElement(ImageGeneratorDialog, { initialPrompt: 'A red kite', onClose: () => {} }));
    expect(html).toContain('Generate an image');
    expect(html).toContain('A red kite');
    expect(html).toContain('<option value="16:9">16:9</option>');
    expect(html).toContain('Checking the price…');
    expect(html).toContain('data-testid="image-generate"');
    expect(html).toContain('Standard (1K)');
  });
});

describe('the generated image', () => {
  const render = (downloading = false) =>
    renderToStaticMarkup(React.createElement(GeneratedImageFrame, { src: 'data:image/jpeg;base64,AAAA', alt: 'A red kite', onDownload: () => {}, downloading }));

  it('opens at normal size, as a zoom toggle reachable by keyboard', () => {
    const html = render();
    expect(html).toMatch(/<img[^>]*role="button"[^>]*tabindex="0"[^>]*aria-pressed="false"/);
    expect(html).toContain('title="Zoom in"');
  });

  it("has a download icon on the image's top-right corner, outside the scrolling frame", () => {
    const html = render();
    expect(html).toMatch(/<button type="button"[^>]*aria-label="Download image"/);
    expect(html.indexOf('data-testid="image-download"')).toBeGreaterThan(html.indexOf('data-testid="image-frame"'));
    expect(html).toMatch(/<svg[^>]*stroke="currentColor"[^>]*aria-hidden="true"/);
    expect(render(true)).toMatch(/<button[^>]*disabled=""[^>]*data-testid="image-download"/);
  });

  it('offers no edit button: PawOS has no image editing to connect it to', () => {
    expect(render()).not.toMatch(/edit/i);
  });

  it('a click zooms in, the next zooms out, and goes no further; Enter and Space too', () => {
    let zoomed = false;
    const setZoomed = (update: (value: boolean) => boolean) => {
      zoomed = update(zoomed);
    };
    const click = { type: 'click', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    zoomOnEvent(click, setZoomed);
    expect(zoomed).toBe(true);
    expect(click.stopPropagation).toHaveBeenCalled();
    zoomOnEvent({ type: 'click', preventDefault: vi.fn(), stopPropagation: vi.fn() }, setZoomed);
    expect(zoomed).toBe(false);
    zoomOnEvent({ type: 'keydown', key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() }, setZoomed);
    expect(zoomed).toBe(true);
    zoomOnEvent({ type: 'keydown', key: 'Tab', preventDefault: vi.fn(), stopPropagation: vi.fn() }, setZoomed);
    expect(zoomed).toBe(true);
  });
});
