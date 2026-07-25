import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './ui/App';
import { authService } from './auth/AuthenticationProvider';
import { organizationService } from './organization/OrganizationService';
import { connectionManagerService } from './connectivity/ConnectionManagerService';
import { connectivityCredentialService } from './connectivity/ConnectivityCredentialService';
import { deploymentProfileService } from './connectivity/DeploymentProfileService';
import { getSupabaseClient } from './auth/supabaseClient';

// TEMPORARY — Section 17 production verification harness. Exposes internal
// renderer services on window so a Playwright driver can exercise the real,
// already-authenticated app session (no token extraction, no bypass of
// Supabase Auth). Remove this block before shipping.
(window as unknown as Record<string, unknown>).__connectivityVerify__ = {
  authService,
  organizationService,
  connectionManagerService,
  connectivityCredentialService,
  deploymentProfileService,
  getSupabaseClient,
};

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

