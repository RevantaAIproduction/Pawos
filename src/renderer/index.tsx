import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './ui/App';
import { installRendererCrashGuard } from './platform/RendererCrashGuard';
import { installOrganizationUsageBridge } from './billing/OrganizationUsageBridge';
import { installConnectivityCredentialBridge } from './connectivity/ConnectivityCredentialBridge';
import { seedManagedGeminiKey } from './ai/seedManagedGeminiKey';

installRendererCrashGuard();
installOrganizationUsageBridge();
installConnectivityCredentialBridge();

async function init() {
  // Seed the managed GEMINI_API_KEY before the React tree mounts so that
  // aiProviderConfigStore.getApiKey('gemini') is never undefined during the
  // first render or any immediately-dispatched action (image analysis, STT,
  // session classification). seedManagedGeminiKey never throws — IPC failure
  // is treated as a missing key and the app mounts with the local provider.
  await seedManagedGeminiKey();

  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root');

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

init().catch(console.error);

