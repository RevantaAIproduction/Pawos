import { devBrowserManager } from '../../execution/DevBrowserManager';
import type { EvidenceCaptureRequest, EvidenceProviderAvailability } from '../../../shared/evidence/EvidenceTypes';
import { failed, type EvidenceProvider, type ProviderCapture } from '../EvidenceProvider';

/** Time for a client-rendered page to paint after load (SPA routing, data fetches). */
const SETTLE_MS = 1500;

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/**
 * A web page captured in PawOS's own hidden browser (the Live Preview / Development Browser engine —
 * never a second browser). Returns the screenshot plus the page's real console errors and failed
 * requests, which is often where the actual problem shows.
 */
export class WebEvidenceProvider implements EvidenceProvider {
  readonly id = 'web' as const;

  constructor(private readonly settleMs = SETTLE_MS) {}

  async availability(): Promise<EvidenceProviderAvailability> {
    return { provider: 'web', available: true, verified: true, detail: "PawOS's hidden browser." };
  }

  async capture(request: EvidenceCaptureRequest): Promise<ProviderCapture> {
    if (request.target.provider !== 'web') return failed('Not a web target.');
    const { url } = request.target;
    if (!/^https?:\/\//i.test(url)) return failed('Give a full http(s) URL for the page.');

    const sessionId = `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const opened = isLocalUrl(url)
        ? await devBrowserManager.open(sessionId, url, [], { hidden: true })
        : await devBrowserManager.navigateUnrestricted(sessionId, url, { hidden: true });
      if (!opened.ok) return failed(`Couldn't open ${url}: ${opened.message}`);
      await new Promise((resolve) => setTimeout(resolve, this.settleMs));

      const shot = await devBrowserManager.captureScreenshot(sessionId);
      if (!shot.ok) return failed(shot.message);
      const title = await devBrowserManager.evaluate(sessionId, 'document.title');
      const consoleErrors = (devBrowserManager.getConsoleLog(sessionId) ?? [])
        .filter((entry) => entry.level === 'error')
        .map((entry) => entry.text.slice(0, 300))
        .slice(-5);
      const failedRequests = (devBrowserManager.getNetworkLog(sessionId) ?? [])
        .filter((entry) => !entry.canceled && (entry.failed || (entry.status ?? 0) >= 400))
        .map((entry) => `${entry.method ?? 'GET'} ${entry.url} → ${entry.status ?? entry.errorText ?? 'failed'}`)
        .slice(-5);

      return {
        ok: true,
        targetDescription: url,
        image: Buffer.from(shot.base64Png, 'base64'),
        pageSignals: { title: title.ok ? String(title.value ?? '') : '', consoleErrors, failedRequests },
      };
    } finally {
      devBrowserManager.close(sessionId);
    }
  }
}
