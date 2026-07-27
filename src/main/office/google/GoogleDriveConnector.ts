import { readFile } from 'fs/promises';
import { basename } from 'path';
import type { ConnectorResult, DocumentProviderConnector, OfficeFileRef } from '../../../shared/office/OfficeTypes';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string };

function toFileRef(f: DriveFile): OfficeFileRef {
  return { id: f.id, name: f.name, mimeType: f.mimeType, webUrl: f.webViewLink, modifiedAt: f.modifiedTime };
}

/** Real Google Drive v3 REST connector — plain fetch + Bearer token, no googleapis dependency,
 *  matching JiraConnector.ts's own raw-REST style. The access token is refreshed in place by
 *  GoogleWorkspaceConnectorSDK via setAccessToken() rather than re-registering a new instance,
 *  since a token refresh is routine (unlike Jira's disconnect(), which really does need a blank
 *  placeholder because InfrastructureConnectorRegistry has no unregister()). */
export class GoogleDriveConnector implements DocumentProviderConnector {
  readonly id = 'googleDrive' as const;
  readonly displayName = 'Google Drive';

  constructor(private accessToken: string | undefined) {}

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Google Drive is not connected. Connect Google Workspace to enable it.' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' };
  }

  async listFiles(query?: string): Promise<ConnectorResult<{ files: OfficeFileRef[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const params = new URLSearchParams({
        fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
        pageSize: '50',
      });
      if (query) params.set('q', `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`);
      else params.set('q', 'trashed = false');
      const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Google Drive API returned ${res.status}` };
      const data = (await res.json()) as { files: DriveFile[] };
      return { ok: true, files: data.files.map(toFileRef) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Drive: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async readFile(fileId: string): Promise<ConnectorResult<{ content: string; mimeType: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const metaRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=mimeType`, { headers: this.headers() });
      if (!metaRes.ok) return { ok: false, reason: `Google Drive API returned ${metaRes.status} for file metadata` };
      const meta = (await metaRes.json()) as { mimeType: string };

      // Native Google Docs/Sheets/Slides have no raw byte content — they must be exported.
      // Everything else (plain files, PDFs treated as text, etc.) is read via alt=media.
      const isNativeDoc = meta.mimeType.startsWith('application/vnd.google-apps.');
      const url = isNativeDoc
        ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
        : `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
      const contentRes = await fetch(url, { headers: this.headers() });
      if (!contentRes.ok) return { ok: false, reason: `Google Drive API returned ${contentRes.status} for file content` };
      const content = await contentRes.text();
      return { ok: true, content, mimeType: isNativeDoc ? 'text/plain' : meta.mimeType };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Drive: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async uploadFile(name: string, localPath: string): Promise<ConnectorResult<{ file: OfficeFileRef }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const fileBytes = await readFile(localPath);
      const boundary = `pawos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({ name: name || basename(localPath) });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
        fileBytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) return { ok: false, reason: `Google Drive API returned ${res.status} for upload` };
      const file = (await res.json()) as DriveFile;
      return { ok: true, file: toFileRef(file) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Drive: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
