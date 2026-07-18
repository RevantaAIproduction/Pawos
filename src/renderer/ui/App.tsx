import React, { useEffect, useMemo } from 'react';
import AppRoot from './AppRoot';
import CompanionExperience from './CompanionExperience';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';

export default function App() {
  const ipc = useIpcBridge();
  const windowRole = useMemo(
    () => new URLSearchParams(window.location.search).get('window') ?? 'main',
    []
  );

  useEffect(() => {
    // .env is the only source of the Gemini key now that there's no Settings
    // UI for entering one manually — always sync from it (not just when
    // unset), so editing .env takes effect on the next launch instead of a
    // stale cached key in localStorage silently winning forever.
    ipc.getEnvApiKeys().then(({ gemini }) => {
      if (gemini) {
        aiProviderConfigStore.setApiKey('gemini', gemini);
      }
    });
  }, [ipc]);

  if (windowRole === 'companion') {
    return <CompanionExperience />;
  }

  return <AppRoot />;
}
