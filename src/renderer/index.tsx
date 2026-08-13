import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './ui/App';
import { installRendererCrashGuard } from './platform/RendererCrashGuard';
import { installOrganizationUsageBridge } from './billing/OrganizationUsageBridge';

installRendererCrashGuard();
installOrganizationUsageBridge();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

