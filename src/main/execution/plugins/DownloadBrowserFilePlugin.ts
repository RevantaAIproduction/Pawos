import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { onFileCreated } from '../../memory/entities/fileEntities';
import { recordDownload } from '../../memory/entities/webEntities';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 400;

type DownloadState = { sessionId: string; savePath: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real downloads only — either clicking a selector or triggering a URL
 * directly, both going through Electron's own will-download event
 * (DevBrowserManager.prepareDownload/triggerDownload), never a bare fetch.
 * Never assumes completion: verify() checks the download item's own final
 * state AND that the file genuinely exists on disk with real bytes.
 */
export class DownloadBrowserFilePlugin extends BasePlugin {
  id = 'downloadBrowserFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'downloadBrowserFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'downloadBrowserFile') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    if (!request.selector && !request.url) {
      return [{ id: 'no-trigger', message: 'What should I click, or which URL should I download, to get this file?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'downloadBrowserFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    // Chromium's native download manager needs a real platform path — unlike
    // fs calls, it does not tolerate forward slashes on Windows (confirmed
    // directly: item.setSavePath() with a "/"-separated path silently fails
    // the download instead of throwing). Model-provided paths commonly use
    // forward slashes, so this normalization is load-bearing, not cosmetic.
    const savePath = path.normalize(request.savePath);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    browserRuntime.prepareDownload(request.sessionId, savePath);

    if (request.url) {
      const triggered = await browserRuntime.triggerDownload(request.sessionId, request.url);
      if (!triggered.ok) return { ok: false, reason: 'failed', message: triggered.message };
    } else if (request.selector) {
      const clicked = await browserRuntime.evaluate(
        request.sessionId,
        `(function() { const el = document.querySelector(${JSON.stringify(request.selector)}); if (!el) return 'missing'; el.click(); return 'clicked'; })()`
      );
      if (!clicked.ok) return { ok: false, reason: 'failed', message: clicked.message };
      if (clicked.value !== 'clicked') return { ok: false, reason: 'failed', message: `Could not find an element matching "${request.selector}".` };
    }

    const data: DownloadState = { sessionId: request.sessionId, savePath };
    return { ok: true, data };
  }

  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'downloadBrowserFile' || !executeResult.ok) return;
    const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
    let lastState: string | undefined;

    while (Date.now() < deadline) {
      const state = browserRuntime.getDownloadState(request.sessionId);
      if (state && state.state !== lastState) {
        lastState = state.state;
        yield {
          at: Date.now(),
          message: state.state === 'progressing' ? `Downloading… ${state.receivedBytes}/${state.totalBytes || '?'} bytes` : `Download ${state.state}.`,
        };
      }
      if (state && state.state !== 'progressing') return;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  /** Never assume a download finished — check Electron's own download-item state AND that the file genuinely exists on disk with real bytes. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'downloadBrowserFile' || !result.ok) return result;
    const data = result.data as DownloadState;
    const state = browserRuntime.getDownloadState(request.sessionId);

    if (!state || state.state !== 'completed') {
      return { ok: false, reason: 'failed', message: state ? `Download ${state.state}, not completed.` : 'No download was ever triggered.', data };
    }
    if (!fs.existsSync(data.savePath)) {
      return { ok: false, reason: 'failed', message: `The download reported complete, but "${data.savePath}" doesn't exist.`, data };
    }
    const size = fs.statSync(data.savePath).size;
    if (size === 0) {
      return { ok: false, reason: 'failed', message: `"${data.savePath}" exists but is empty.`, data };
    }

    // Registers the download with the Memory Graph (File Runtime's own
    // fileEntities.ts owns the actual entity; this just adds the
    // DOWNLOADED_FROM provenance edge back to the page it came from) —
    // "every browsing session may create downloads... relationships."
    const fileEntity = onFileCreated(data.savePath);
    const sourceUrl = request.url ?? browserRuntime.getCurrentUrl(request.sessionId) ?? undefined;
    recordDownload(fileEntity.id, sourceUrl);

    return { ok: true, data: { ...data, sizeBytes: size } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'downloadBrowserFile' || result.ok) return result;
    return this.execute(request);
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'downloadBrowserFile') return 'Working on that…';
    return `Downloading to ${request.savePath}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'downloadBrowserFile') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as (DownloadState & { sizeBytes?: number }) | undefined;
    return `I've downloaded it to ${data?.savePath} (${data?.sizeBytes ?? '?'} bytes) — verified it's really there.`;
  }
}

export const downloadBrowserFilePlugin = new DownloadBrowserFilePlugin();
