import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { KnownAppId } from '../../../../shared/actions/ActionTypes';

const APPS: { id: KnownAppId; label: string }[] = [
  { id: 'vscode', label: 'Open VS Code' },
  { id: 'chrome', label: 'Open Chrome' },
  { id: 'explorer', label: 'Open File Explorer' },
  { id: 'notepad', label: 'Open Notepad' },
  { id: 'terminal', label: 'Open Terminal' },
];

/** Every action here maps 1:1 to a real, implemented ActionEngine case — see src/shared/actions/ActionTypes.ts for the honest implemented/planned split. Nothing here is faked. */
export function DesktopSection() {
  const ipc = useIpcBridge();
  const [appStatus, setAppStatus] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [urlStatus, setUrlStatus] = useState<string | null>(null);

  const [folderPath, setFolderPath] = useState('');
  const [folderStatus, setFolderStatus] = useState<string | null>(null);

  const [searchRoot, setSearchRoot] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  const runApp = async (appId: KnownAppId, label: string) => {
    setAppStatus(`${label}…`);
    const result = await ipc.executeAction({ type: 'openApp', appId });
    setAppStatus(result.ok ? `${label} ✓` : `${label} failed: ${result.reason}`);
    window.setTimeout(() => setAppStatus(null), 3000);
  };

  const runOpenUrl = async () => {
    if (!url.trim()) return;
    setUrlStatus('Opening…');
    const result = await ipc.executeAction({ type: 'openUrl', url: url.trim() });
    setUrlStatus(result.ok ? 'Opened ✓' : `Failed: ${result.reason}`);
  };

  const runOpenFolder = async () => {
    if (!folderPath.trim()) return;
    setFolderStatus('Opening…');
    const result = await ipc.executeAction({ type: 'openFolder', path: folderPath.trim() });
    setFolderStatus(result.ok ? 'Opened ✓' : `Failed: ${result.reason}`);
  };

  const runSearch = async () => {
    if (!searchRoot.trim() || !searchQuery.trim()) return;
    setSearchStatus('Searching…');
    setSearchResults(null);
    const result = await ipc.executeAction({ type: 'searchFiles', rootPath: searchRoot.trim(), query: searchQuery.trim() });
    if (result.ok) {
      const matches = (result.data as string[]) ?? [];
      setSearchResults(matches);
      setSearchStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);
    } else {
      setSearchStatus(`Failed: ${result.reason}`);
    }
  };

  return (
    <div>
      <h3 className={styles.subheading} style={{ marginTop: 0 }}>
        Open an app
      </h3>
      <div className={styles.quickActions}>
        {APPS.map((app) => (
          <button key={app.id} type="button" className={styles.chip} onClick={() => runApp(app.id, app.label)}>
            {app.label}
          </button>
        ))}
      </div>
      {appStatus && <p className={styles.cardBody} style={{ marginTop: 8 }}>{appStatus}</p>}

      <h3 className={styles.subheading}>Open a website</h3>
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
          <button type="button" className={styles.chip} onClick={runOpenUrl}>
            Open
          </button>
        </div>
        {urlStatus && <p className={styles.cardBody} style={{ marginTop: 8 }}>{urlStatus}</p>}
      </div>

      <h3 className={styles.subheading}>Open a folder</h3>
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="C:\Users\you\Documents"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            style={inputStyle}
          />
          <button type="button" className={styles.chip} onClick={runOpenFolder}>
            Open
          </button>
        </div>
        {folderStatus && <p className={styles.cardBody} style={{ marginTop: 8 }}>{folderStatus}</p>}
      </div>

      <h3 className={styles.subheading}>Search files</h3>
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Folder to search in"
            value={searchRoot}
            onChange={(e) => setSearchRoot(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="File name contains…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
          <button type="button" className={styles.chip} onClick={runSearch}>
            Search
          </button>
        </div>
        {searchStatus && <p className={styles.cardBody} style={{ marginTop: 8 }}>{searchStatus}</p>}
        {searchResults && searchResults.length > 0 && (
          <ul style={{ marginTop: 10, paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }}>
            {searchResults.map((path) => (
              <li key={path} className={styles.cardBody}>
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.02)',
  color: '#f5f5f7',
  padding: '8px 10px',
  fontSize: 12.5,
};
