import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './ui/App';
import { installRendererCrashGuard } from './platform/RendererCrashGuard';
import { installOrganizationUsageBridge } from './billing/OrganizationUsageBridge';
import { installConnectivityCredentialBridge } from './connectivity/ConnectivityCredentialBridge';
import { seedManagedGeminiKey } from './ai/seedManagedGeminiKey';
import { startAccountSessionSync } from './auth/accountSessionSync';

async function init() {
  installRendererCrashGuard();
  installOrganizationUsageBridge();
  installConnectivityCredentialBridge();
  // Main verifies the signed-in session itself; it scopes Work History and file-change records per account.
  startAccountSessionSync();

  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root');

  await seedManagedGeminiKey();

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

init().catch(e => {
  console.error('[Renderer] Fatal error:', e);
  const container = document.getElementById('root');
  if (container) {
    container.innerHTML = `<div style="color: #ff6b6b; padding: 40px; font-family: monospace; white-space: pre-wrap; word-break: break-all;">FATAL ERROR\n\n${String(e)}\n\n${(e as any)?.stack || ''}</div>`;
  }
});

