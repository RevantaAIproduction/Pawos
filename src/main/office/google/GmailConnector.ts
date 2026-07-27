import type { ConnectorResult, MailboxProviderConnector } from '../../../shared/office/OfficeTypes';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name: string; value: string };
type GmailMessagePart = { mimeType?: string; body?: { data?: string }; parts?: GmailMessagePart[]; headers?: GmailHeader[] };
type GmailMessage = { id: string; snippet?: string; payload?: GmailMessagePart & { headers?: GmailHeader[] } };

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

/** Best-effort plain-text body extraction from Gmail's nested MIME part tree — prefers
 *  text/plain, falls back to the first part with any decodable body rather than fabricating
 *  content that isn't there. */
function extractPlainText(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text) return text;
  }
  if (part.body?.data) return decodeBase64Url(part.body.data);
  return '';
}

/** Real Gmail v1 REST connector — read-only by design. Sending stays exclusively the existing
 *  browser-compose + explicit-confirmation flow (see MailComposeUrl.ts / OFF-7); this class has
 *  no send method at all, so there is no API path that could ever send an email silently. */
export class GmailConnector implements MailboxProviderConnector {
  readonly id = 'gmail' as const;
  readonly displayName = 'Gmail';

  constructor(private accessToken: string | undefined) {}

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Gmail is not connected. Connect Google Workspace to enable it.' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' };
  }

  async listRecentThreads(
    maxResults: number
  ): Promise<ConnectorResult<{ threads: { id: string; subject: string; snippet: string; from: string; at: string }[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const listRes = await fetch(`${GMAIL_API}/threads?maxResults=${encodeURIComponent(String(maxResults))}`, { headers: this.headers() });
      if (!listRes.ok) return { ok: false, reason: `Gmail API returned ${listRes.status}` };
      const list = (await listRes.json()) as { threads?: { id: string; snippet?: string }[] };
      const threads = await Promise.all(
        (list.threads ?? []).map(async (t) => {
          const metaParams = new URLSearchParams({ format: 'metadata' });
          metaParams.append('metadataHeaders', 'Subject');
          metaParams.append('metadataHeaders', 'From');
          metaParams.append('metadataHeaders', 'Date');
          const metaRes = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(t.id)}?${metaParams.toString()}`, { headers: this.headers() });
          if (!metaRes.ok) return { id: t.id, subject: '(unavailable)', snippet: t.snippet ?? '', from: '', at: '' };
          const meta = (await metaRes.json()) as { messages?: GmailMessage[] };
          const headers = meta.messages?.[0]?.payload?.headers;
          return {
            id: t.id,
            subject: headerValue(headers, 'Subject'),
            snippet: t.snippet ?? '',
            from: headerValue(headers, 'From'),
            at: headerValue(headers, 'Date'),
          };
        })
      );
      return { ok: true, threads };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Gmail: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async readThread(threadId: string): Promise<ConnectorResult<{ subject: string; messages: { from: string; at: string; body: string }[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=full`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Gmail API returned ${res.status}` };
      const data = (await res.json()) as { messages?: GmailMessage[] };
      const messages = (data.messages ?? []).map((m) => ({
        from: headerValue(m.payload?.headers, 'From'),
        at: headerValue(m.payload?.headers, 'Date'),
        body: extractPlainText(m.payload),
      }));
      const subject = headerValue(data.messages?.[0]?.payload?.headers, 'Subject');
      return { ok: true, subject, messages };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Gmail: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
