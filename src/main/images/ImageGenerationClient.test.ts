import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { ImageGenerationClient, imageFileExtension, isImageId, sniffImageBytes } from './ImageGenerationClient';

/**
 * PawOS Desktop's image client: it only ever talks to the PawOS server, with the signed-in session,
 * and it never retries a generation on its own. Mocks only — no network, no model, no charge.
 */

const BASE = 'https://pawos.example.test';
const TOKEN = 'header.payload.signature';
const IMAGE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const GO_MESSAGE = "You've used your 3 free image generations. Upgrade your PawOS plan or purchase additional credits to generate more images.";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bytes = (status: number, data: Uint8Array, type = 'image/jpeg') => new Response(data, { status, headers: { 'content-type': type } });
const request = { requestId: 'req-12345678', prompt: 'A fox in the snow', aspectRatio: '16:9' as const };
const succeeded = { ok: true, image: { id: IMAGE_ID, chargedPc: 9.7, funding: 'bucket', aspectRatio: '16:9', mimeType: 'image/jpeg' } };

describe('the image price', () => {
  it('asks the server with the session as a bearer token and passes the price through', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true, chargePc: 9.7, funding: 'free_then_credits', freeImagesLeft: 2, model: 'm' }));
    const result = await new ImageGenerationClient(BASE, fetchImpl).allowance(TOKEN);
    expect(result).toEqual({ ok: true, allowance: { chargePc: 9.7, funding: 'free_then_credits', freeImagesLeft: 2 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/web/images/allowance`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('says so when it is signed out or the server cannot answer', async () => {
    const fetchImpl = vi.fn(async () => json(503, { ok: false, message: "Image generation isn't available right now." }));
    const client = new ImageGenerationClient(BASE, fetchImpl);
    expect(await client.allowance('')).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await client.allowance(TOKEN)).toEqual({ ok: false, message: "Image generation isn't available right now." });
    const offline = new ImageGenerationClient(BASE, vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await offline.allowance(TOKEN)).toMatchObject({ ok: false });
  });
});

describe('generating an image', () => {
  it('sends one request to the server, then shows the stored image from its protected address', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/generate') ? json(200, succeeded) : bytes(200, JPEG)));
    const result = await new ImageGenerationClient(BASE, fetchImpl).generate(TOKEN, request);
    expect(result).toEqual({
      ok: true,
      image: { id: IMAGE_ID, chargedPc: 9.7, funding: 'bucket', aspectRatio: '16:9', mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}` },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [generateUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(generateUrl).toBe(`${BASE}/api/web/images/generate`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ requestId: 'req-12345678', prompt: 'A fox in the snow', aspectRatio: '16:9', imageSize: '1K' });
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE}/api/web/images/${IMAGE_ID}`);
  });

  it("passes the server's refusal through — the Go message and its Upgrade / Buy Credits actions — and never retries", async () => {
    const fetchImpl = vi.fn(async () => json(402, { ok: false, code: 'free_images_used', message: GO_MESSAGE, actions: { upgrade: true, buyCredits: true } }));
    const result = await new ImageGenerationClient(BASE, fetchImpl).generate(TOKEN, request);
    expect(result).toEqual({ ok: false, answered: true, code: 'free_images_used', message: GO_MESSAGE, actions: { upgrade: true, buyCredits: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a refused prompt is an answer: the next press is a new request', async () => {
    const fetchImpl = vi.fn(async () => json(422, { ok: false, code: 'image_refused', message: "That image can't be made." }));
    expect(await new ImageGenerationClient(BASE, fetchImpl).generate(TOKEN, request)).toMatchObject({ ok: false, answered: true, code: 'image_refused' });
  });

  it('no answer (network failure, gateway page, still processing) keeps the same request id for the retry', async () => {
    const offline = new ImageGenerationClient(BASE, vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await offline.generate(TOKEN, request)).toMatchObject({ ok: false, answered: false, code: 'unreachable' });
    const gateway = new ImageGenerationClient(BASE, vi.fn(async () => new Response('<html>504</html>', { status: 504 })));
    expect(await gateway.generate(TOKEN, request)).toMatchObject({ ok: false, answered: false });
    const processing = new ImageGenerationClient(BASE, vi.fn(async () => json(409, { ok: false, code: 'processing', message: 'That image is still being generated.' })));
    expect(await processing.generate(TOKEN, request)).toMatchObject({ ok: false, answered: false, code: 'processing' });
  });

  it('a made image that cannot be loaded is retried with the same id (the server returns it, uncharged)', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/generate') ? json(200, succeeded) : json(404, { ok: false })));
    expect(await new ImageGenerationClient(BASE, fetchImpl).generate(TOKEN, request)).toMatchObject({ ok: false, answered: false, code: 'image_unreadable' });
  });

  it('shows only real image bytes, whatever the content type says', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/generate') ? json(200, succeeded) : bytes(200, new TextEncoder().encode('<svg onload=x>'), 'image/png')));
    expect(await new ImageGenerationClient(BASE, fetchImpl).generate(TOKEN, request)).toMatchObject({ ok: false, code: 'image_unreadable' });
  });

  it('checks the request before sending anything', async () => {
    const fetchImpl = vi.fn();
    const client = new ImageGenerationClient(BASE, fetchImpl);
    expect(await client.generate('', request)).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(await client.generate(TOKEN, { ...request, prompt: '   ' })).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(await client.generate(TOKEN, { ...request, prompt: 'x'.repeat(2001) })).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(await client.generate(TOKEN, { ...request, requestId: 'short' })).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(await client.generate(TOKEN, { ...request, aspectRatio: '7:3' as never })).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('reading a stored image', () => {
  it('reads only image ids, and only image bytes', async () => {
    const fetchImpl = vi.fn(async () => bytes(200, PNG, 'image/png'));
    const client = new ImageGenerationClient(BASE, fetchImpl);
    expect(await client.readImage(TOKEN, '../../etc/passwd')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await client.readImage(TOKEN, IMAGE_ID)).toEqual({ bytes: PNG, mimeType: 'image/png' });
  });

  it('recognises the three kept image types by their bytes', () => {
    expect(sniffImageBytes(JPEG)).toBe('image/jpeg');
    expect(sniffImageBytes(PNG)).toBe('image/png');
    expect(sniffImageBytes(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageBytes(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(isImageId(IMAGE_ID)).toBe(true);
    expect(isImageId('not-an-id')).toBe(false);
    expect(imageFileExtension('image/jpeg')).toBe('jpg');
  });
});

describe('no model key in PawOS Desktop', () => {
  it("the Desktop image code calls only the PawOS server — never Google's API or a key", () => {
    const files = [
      path.join(__dirname, 'ImageGenerationClient.ts'),
      path.join(__dirname, '../../shared/images/ImageGenerationTypes.ts'),
      path.join(__dirname, '../../renderer/ui/images/ImageGeneratorDialog.tsx'),
      path.join(__dirname, '../../renderer/ui/images/imageGeneratorText.ts'),
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/generativelanguage|GEMINI_API_KEY|x-goog-api-key|process\.env/);
    }
  });
});
